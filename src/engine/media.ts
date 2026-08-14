import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSampleSink,
} from "mediabunny";
import type { AssetMeta } from "../types";
import { uid } from "../types";

export type LoadedAsset = AssetMeta & {
  file: File;
  url: string;
};

class Registry {
  assets = new Map<string, LoadedAsset>();
  images = new Map<string, HTMLImageElement>();
  videos = new Map<string, HTMLVideoElement>();
  audioEl = new Map<string, HTMLAudioElement>();
  audioBuffers = new Map<string, AudioBuffer>();
  inputs = new Map<string, Input>();
  sinks = new Map<string, VideoSampleSink>();
  thumbCanvases = new Map<string, HTMLCanvasElement>();

  get(id: string) {
    return this.assets.get(id);
  }

  revoke(id: string) {
    const a = this.assets.get(id);
    if (a) URL.revokeObjectURL(a.url);
    this.assets.delete(id);
    this.images.delete(id);
    const v = this.videos.get(id);
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    this.videos.delete(id);
    this.audioEl.delete(id);
    this.audioBuffers.delete(id);
    this.inputs.get(id)?.dispose();
    this.inputs.delete(id);
    this.sinks.delete(id);
  }

  clear() {
    for (const id of [...this.assets.keys()]) this.revoke(id);
  }
}

export const media = new Registry();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image load failed"));
    img.src = url;
  });
}

function loadVideoEl(url: string): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.playsInline = true;
    v.muted = true;
    v.crossOrigin = "anonymous";
    v.onloadedmetadata = () => res(v);
    v.onerror = () => rej(new Error("video load failed"));
    v.src = url;
  });
}

async function probeWithBunny(file: File): Promise<{
  duration: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  input: Input;
  sink?: VideoSampleSink;
} | null> {
  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const duration = await input.computeDuration();
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    let width: number | undefined;
    let height: number | undefined;
    let sink: VideoSampleSink | undefined;
    if (v) {
      width = await v.getDisplayWidth();
      height = await v.getDisplayHeight();
      if (await v.canDecode()) sink = new VideoSampleSink(v);
    }
    return { duration, width, height, hasAudio: !!a, input, sink };
  } catch {
    return null;
  }
}

async function decodeAudio(file: File): Promise<AudioBuffer | null> {
  try {
    const ctx = new AudioContext();
    const buf = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    ctx.close();
    return decoded;
  } catch {
    return null;
  }
}

export async function ingestFile(file: File, reuseId?: string): Promise<LoadedAsset> {
  const id = reuseId || uid("ast");
  const url = URL.createObjectURL(file);
  const mime = file.type || "application/octet-stream";
  let kind: AssetMeta["kind"] = "video";
  if (mime.startsWith("image/")) kind = "image";
  else if (mime.startsWith("audio/")) kind = "audio";
  else if (mime.startsWith("video/")) kind = "video";
  else if (/\.(png|jpe?g|gif|webp|avif)$/i.test(file.name)) kind = "image";
  else if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) kind = "audio";

  const meta: LoadedAsset = {
    id,
    kind,
    name: file.name,
    mime,
    duration: 0,
    file,
    url,
  };

  if (kind === "image") {
    const img = await loadImage(url);
    meta.width = img.naturalWidth;
    meta.height = img.naturalHeight;
    meta.duration = 4;
    media.images.set(id, img);
  } else if (kind === "audio") {
    const bunny = await probeWithBunny(file);
    if (bunny) {
      meta.duration = bunny.duration || 0;
      media.inputs.set(id, bunny.input);
    }
    const el = document.createElement("audio");
    el.preload = "auto";
    el.src = url;
    await new Promise<void>((r) => {
      el.onloadedmetadata = () => r();
      el.onerror = () => r();
    });
    if (!meta.duration) meta.duration = el.duration || 0;
    media.audioEl.set(id, el);
    const decoded = await decodeAudio(file);
    if (decoded) {
      media.audioBuffers.set(id, decoded);
      if (!meta.duration) meta.duration = decoded.duration;
    }
    meta.hasAudio = true;
  } else {
    const bunny = await probeWithBunny(file);
    const v = await loadVideoEl(url);
    meta.width = bunny?.width || v.videoWidth;
    meta.height = bunny?.height || v.videoHeight;
    meta.duration = bunny?.duration || v.duration || 0;
    meta.hasAudio = bunny?.hasAudio ?? (v as HTMLVideoElement & { mozHasAudio?: boolean }).mozHasAudio !== false;
    v.muted = false;
    media.videos.set(id, v);
    if (bunny) {
      media.inputs.set(id, bunny.input);
      if (bunny.sink) media.sinks.set(id, bunny.sink);
    }
    const decoded = await decodeAudio(file);
    if (decoded) {
      media.audioBuffers.set(id, decoded);
      meta.hasAudio = true;
    }
  }

  media.assets.set(id, meta);
  return meta;
}

export function sourceTime(clip: { trimIn: number; start: number }, t: number) {
  return Math.max(0, clip.trimIn + (t - clip.start));
}

export async function frameForClip(
  clip: { id: string; assetId?: string; type: string; trimIn: number; start: number },
  t: number,
  preferLive: boolean,
): Promise<CanvasImageSource | null> {
  if (!clip.assetId) return null;
  if (clip.type === "image") return media.images.get(clip.assetId) ?? null;
  const st = sourceTime(clip, t);
  if (preferLive) {
    const v = media.videos.get(clip.assetId);
    if (v && v.readyState >= 2) return v;
  }
  const sink = media.sinks.get(clip.assetId);
  if (sink) {
    try {
      const sample = await sink.getSample(st);
      if (sample) {
        const c = document.createElement("canvas");
        c.width = sample.codedWidth || sample.displayWidth || 1080;
        c.height = sample.codedHeight || sample.displayHeight || 1920;
        const ctx = c.getContext("2d");
        if (ctx) sample.draw(ctx, 0, 0, c.width, c.height);
        sample.close();
        return c;
      }
    } catch {
      /* fall through */
    }
  }
  const v = media.videos.get(clip.assetId);
  if (!v) return media.images.get(clip.assetId) ?? null;
  if (Math.abs(v.currentTime - st) > 0.045) {
    await seekVideo(v, st);
  }
  return v;
}

export function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      res();
    };
    v.addEventListener("seeked", done);
    try {
      v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - 0.001));
    } catch {
      res();
    }
    setTimeout(done, 280);
  });
}

export async function blobFromAsset(id: string): Promise<Blob | undefined> {
  return media.assets.get(id)?.file;
}
