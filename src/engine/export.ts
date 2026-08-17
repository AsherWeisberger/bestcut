import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import type { Project } from "../types";
import { ASPECT_SIZE, FPS, projectDuration } from "../types";
import { mixProjectAudio } from "./audio";
import { frameForClip } from "./media";
import { renderFrame, visibleMediaClips, type FrameBank } from "./render";
import { blitKit } from "../kit/capture";
import { isKitPreset } from "../kit/catalog";
import { useEditor } from "../store";

export type ExportFormat = "mp4" | "webm";

export type CodecSupport = {
  avc: boolean;
  vp9: boolean;
  vp8: boolean;
  aac: boolean;
  opus: boolean;
  mp4: boolean;
  webm: boolean;
  mediaRecorderWebm: boolean;
};

export async function probeCodecs(): Promise<CodecSupport> {
  const safe = async (p: Promise<boolean>) => {
    try {
      return !!(await p);
    } catch {
      return false;
    }
  };
  const avc = await safe(canEncodeVideo("avc"));
  const vp9 = await safe(canEncodeVideo("vp9"));
  const vp8 = await safe(canEncodeVideo("vp8"));
  const aac = await safe(canEncodeAudio("aac"));
  const opus = await safe(canEncodeAudio("opus"));
  let mediaRecorderWebm = false;
  try {
    mediaRecorderWebm =
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus");
  } catch {
    mediaRecorderWebm = false;
  }
  return {
    avc,
    vp9,
    vp8,
    aac,
    opus,
    mp4: avc && aac,
    webm: (vp9 || vp8) && opus,
    mediaRecorderWebm,
  };
}

export type ExportOpts = {
  format: ExportFormat;
  onProgress?: (p: number, label: string) => void;
  signal?: AbortSignal;
};

async function fillBank(project: Project, t: number, preferLive: boolean): Promise<FrameBank> {
  const bank: FrameBank = { frames: new Map() };
  const clips = visibleMediaClips(project, t);
  await Promise.all(
    clips.map(async (c) => {
      const frame = await frameForClip(c, t, preferLive);
      if (frame) bank.frames.set(c.id, frame);
    }),
  );
  return bank;
}

export async function exportProject(project: Project, opts: ExportOpts): Promise<Blob> {
  const support = await probeCodecs();
  const duration = Math.max(0.2, projectDuration(project));
  if (opts.format === "mp4") {
    if (support.avc) return exportWebCodecs(project, duration, "mp4", opts);
    if (support.webm) {
      const webm = await exportWebCodecs(project, duration, "webm", opts);
      return webm;
    }
  } else {
    if (support.vp9 || support.vp8) return exportWebCodecs(project, duration, "webm", opts);
  }
  if (support.mediaRecorderWebm) return exportMediaRecorder(project, duration, opts);
  throw new Error("This browser cannot encode video. Try Chrome or Edge.");
}

async function exportWebCodecs(
  project: Project,
  duration: number,
  format: ExportFormat,
  opts: ExportOpts,
): Promise<Blob> {
  const { w, h } = ASPECT_SIZE[project.aspect];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas");

  const vCodecs = format === "mp4" ? (["avc"] as const) : (["vp9", "vp8"] as const);
  const aCodecs = format === "mp4" ? (["aac", "opus"] as const) : (["opus"] as const);
  const vCodec = await getFirstEncodableVideoCodec([...vCodecs]);
  const aCodec = await getFirstEncodableAudioCodec([...aCodecs]);
  if (!vCodec) throw new Error("No encodable video codec");

  const videoSource = new CanvasSource(canvas, {
    codec: vCodec,
    quality: new Quality({ bitrate: 6_000_000 }),
  });

  const mixed = mixProjectAudio(project, duration);
  let audioSource: AudioBufferSource | null = null;
  if (aCodec && mixed.duration > 0) {
    audioSource = new AudioBufferSource({
      codec: aCodec,
      quality: new Quality({ bitrate: 160_000 }),
    });
  }

  const output = new Output({
    format: format === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });
  if (audioSource) output.addAudioTrack(audioSource);

  await output.start();
  if (audioSource) {
    opts.onProgress?.(0.02, "Mixing audio");
    await audioSource.add(mixed);
    audioSource.close();
  }

  const total = Math.max(1, Math.round(duration * FPS));
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) {
      await output.cancel();
      throw new DOMException("cancelled", "AbortError");
    }
    const t = i / FPS;
    const bank = await fillBank(project, t, false);
    renderFrame(ctx, t, project, bank);
    if (project.clips.some((c) => c.type === "text" && isKitPreset(c.inPreset || c.preset))) {
      useEditor.getState().setPlayhead(t);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await blitKit(ctx, w, h);
    }
    await videoSource.add(t, 1 / FPS, { keyFrame: i % 30 === 0 });
    if (i % 4 === 0) opts.onProgress?.(0.05 + (i / total) * 0.9, `Encoding ${Math.floor(t)} / ${Math.ceil(duration)}s`);
  }
  videoSource.close();
  opts.onProgress?.(0.97, format === "mp4" ? "Writing MP4" : "Writing WebM");
  await output.finalize();
  const buf = output.target.buffer;
  if (!buf) throw new Error("Empty export");
  const mime = format === "mp4" ? "video/mp4" : "video/webm";
  return new Blob([buf], { type: mime });
}

async function exportMediaRecorder(project: Project, duration: number, opts: ExportOpts): Promise<Blob> {
  const { w, h } = ASPECT_SIZE[project.aspect];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas");
  const stream = canvas.captureStream(FPS);
  const mixed = mixProjectAudio(project, duration);
  const actx = new AudioContext({ sampleRate: mixed.sampleRate });
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = mixed;
  src.connect(dest);
  dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    rec.onerror = () => reject(new Error("MediaRecorder failed"));
  });
  rec.start(200);
  src.start();
  const total = Math.max(1, Math.round(duration * FPS));
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) {
      rec.stop();
      throw new DOMException("cancelled", "AbortError");
    }
    const t = i / FPS;
    const bank = await fillBank(project, t, false);
    renderFrame(ctx, t, project, bank);
    if (project.clips.some((c) => c.type === "text" && isKitPreset(c.inPreset || c.preset))) {
      useEditor.getState().setPlayhead(t);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await blitKit(ctx, w, h);
    }
    opts.onProgress?.(i / total, `Encoding ${Math.floor(t)} / ${Math.ceil(duration)}s`);
    await new Promise((r) => setTimeout(r, 1000 / FPS));
  }
  rec.stop();
  actx.close();
  return done;
}
