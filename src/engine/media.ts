import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSampleSink,
} from "mediabunny";
import type { AssetMeta } from "../types";
import { clipSpeed, uid } from "../types";

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
    const to = window.setTimeout(() => rej(new Error("image load timeout")), 8000);
    img.onload = () => {
      window.clearTimeout(to);
      res(img);
    };
    img.onerror = () => {
      window.clearTimeout(to);
      rej(new Error("image load failed"));
    };
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
    const to = window.setTimeout(() => rej(new Error("video load timeout")), 8000);
    v.onloadedmetadata = () => {
      window.clearTimeout(to);
      res(v);
    };
    v.onerror = () => {
      window.clearTimeout(to);
      rej(new Error("video load failed"));
    };
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
    ensureThumb(id);
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
      const to = window.setTimeout(() => r(), 8000);
      el.onloadedmetadata = () => {
        window.clearTimeout(to);
        r();
      };
      el.onerror = () => {
        window.clearTimeout(to);
        r();
      };
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
    let v: HTMLVideoElement | null = null;
    try {
      v = await loadVideoEl(url);
    } catch {
      v = null;
    }
    meta.width = bunny?.width || v?.videoWidth;
    meta.height = bunny?.height || v?.videoHeight;
    meta.duration = bunny?.duration || v?.duration || 0;
    meta.hasAudio = bunny?.hasAudio ?? true;
    if (v) {
      v.muted = false;
      media.videos.set(id, v);
      try { v.currentTime = Math.min(0.2, (v.duration || 1) * 0.05); } catch { /* */ }
      v.addEventListener("seeked", () => { media.thumbCanvases.delete(id); ensureThumb(id); }, { once: true });
    }
    if (bunny) {
      media.inputs.set(id, bunny.input);
      if (bunny.sink) media.sinks.set(id, bunny.sink);
    }
    const decoded = await decodeAudio(file);
    if (decoded) {
      media.audioBuffers.set(id, decoded);
      meta.hasAudio = true;
      if (!meta.duration) meta.duration = decoded.duration;
    }
    if (!meta.duration && !v && !bunny) throw new Error("video load failed");
  }

  media.assets.set(id, meta);
  return meta;
}

export function sourceTime(
  clip: { trimIn: number; start: number; speed?: number; duration?: number },
  t: number,
) {
  const spd = clipSpeed(clip);
  const st = clip.trimIn + (t - clip.start) * spd;
  if (clip.duration == null || clip.duration <= 0) return Math.max(0, st);
  const max = clip.trimIn + clip.duration * spd - 1e-4;
  return Math.max(clip.trimIn, Math.min(st, max));
}

export function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  dw: number,
  dh: number,
) {
  const iw =
    (img as HTMLVideoElement).videoWidth ||
    (img as HTMLImageElement).naturalWidth ||
    (img as HTMLCanvasElement).width ||
    dw;
  const ih =
    (img as HTMLVideoElement).videoHeight ||
    (img as HTMLImageElement).naturalHeight ||
    (img as HTMLCanvasElement).height ||
    dh;
  if (!iw || !ih) return;
  const s = Math.max(dw / iw, dh / ih);
  const sw = dw / s;
  const sh = dh / s;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, 0, 0, dw, dh);
}

export function ensureThumb(id: string): HTMLCanvasElement {
  const hit = media.thumbCanvases.get(id);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 48;
  const ctx = c.getContext("2d")!;
  const img = media.images.get(id);
  const v = media.videos.get(id);
  const src = img || (v && v.readyState >= 2 ? v : null);
  if (src) coverDraw(ctx, src, 64, 48);
  else {
    const g = ctx.createLinearGradient(0, 0, 64, 48);
    g.addColorStop(0, "#3a3428");
    g.addColorStop(1, "#0D0F14");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 48);
  }
  media.thumbCanvases.set(id, c);
  return c;
}

export function peaksFor(id: string, bins = 80): number[] | null {
  const buf = media.audioBuffers.get(id);
  if (!buf) return null;
  const ch = buf.getChannelData(0);
  const peaks = new Array(bins).fill(0);
  const step = ch.length / bins;
  for (let i = 0; i < bins; i++) {
    let m = 0;
    const a = Math.floor(i * step);
    const b = Math.min(ch.length, Math.floor((i + 1) * step));
    for (let j = a; j < b; j += 8) m = Math.max(m, Math.abs(ch[j]));
    peaks[i] = m;
  }
  return peaks;
}

export async function frameForClip(
  clip: {
    id: string;
    assetId?: string;
    type: string;
    trimIn: number;
    start: number;
    speed?: number;
    duration?: number;
  },
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
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(to);
      v.removeEventListener("seeked", done);
      res();
    };
    const to = window.setTimeout(done, 280);
    v.addEventListener("seeked", done);
    try {
      v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - 0.001));
    } catch {
      done();
    }
  });
}

export async function blobFromAsset(id: string): Promise<Blob | undefined> {
  return media.assets.get(id)?.file;
}
