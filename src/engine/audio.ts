import type { Clip, Project } from "../types";
import { clipEnd } from "../types";
import { media, sourceTime } from "./media";

const SR = 48000;

function clipGain(c: Clip, t: number) {
  if (t < c.start || t >= clipEnd(c)) return 0;
  const lt = t - c.start;
  let g = c.volume;
  if (c.fadeIn > 0) g *= Math.min(1, lt / c.fadeIn);
  if (c.fadeOut > 0) g *= Math.min(1, (c.duration - lt) / c.fadeOut);
  return g;
}

function rmsOf(buf: AudioBuffer, t0: number, t1: number) {
  const ch = buf.getChannelData(0);
  const a = Math.max(0, Math.floor(t0 * buf.sampleRate));
  const b = Math.min(ch.length, Math.floor(t1 * buf.sampleRate));
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i += 8) s += ch[i] * ch[i];
  return Math.sqrt(s / Math.max(1, (b - a) / 8));
}

export function mixProjectAudio(project: Project, duration: number): AudioBuffer {
  const length = Math.max(1, Math.ceil(duration * SR));
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: SR });
  const L = out.getChannelData(0);
  const R = out.getChannelData(1);

  const voiceClips = project.clips.filter(
    (c) => (c.type === "video" || c.type === "audio") && c.role !== "bgm" && c.assetId,
  );
  const bgmClips = project.clips.filter((c) => c.role === "bgm" && c.assetId);

  const duck = new Float32Array(length);
  duck.fill(1);
  const win = Math.floor(0.05 * SR);
  for (const c of voiceClips) {
    const buf = media.audioBuffers.get(c.assetId!);
    if (!buf) continue;
    const start = Math.floor(c.start * SR);
    const n = Math.floor(c.duration * SR);
    for (let i = 0; i < n; i += win) {
      const t = c.start + i / SR;
      const st = sourceTime(c, t);
      const level = rmsOf(buf, st, st + 0.05);
      if (level > 0.04) {
        const from = start + i;
        const to = Math.min(length, from + win);
        for (let j = from; j < to; j++) duck[j] = 0.28; // ~11 dB
      }
    }
  }
  // smooth duck
  let acc = 1;
  for (let i = 0; i < length; i++) {
    acc = acc * 0.997 + duck[i] * 0.003;
    duck[i] = acc;
  }

  const mixClip = (c: Clip, isBgm: boolean) => {
    const buf = media.audioBuffers.get(c.assetId!);
    if (!buf) return;
    const chN = buf.numberOfChannels;
    const sL = buf.getChannelData(0);
    const sR = chN > 1 ? buf.getChannelData(1) : sL;
    const start = Math.floor(c.start * SR);
    const n = Math.floor(c.duration * SR);
    for (let i = 0; i < n; i++) {
      const oi = start + i;
      if (oi < 0 || oi >= length) continue;
      const t = oi / SR;
      let g = clipGain(c, t);
      if (isBgm) g *= duck[oi];
      // sourceTime already applies clip.speed (resample / chipmunk). Export uses this mix.
      const st = sourceTime(c, t);
      const si = Math.floor(st * buf.sampleRate);
      if (si < 0 || si >= sL.length) continue;
      L[oi] += sL[si] * g;
      R[oi] += sR[si] * g;
    }
  };

  for (const c of project.clips) {
    if (!c.assetId) continue;
    if (c.type !== "video" && c.type !== "audio") continue;
    const tr = project.tracks.find((x) => x.id === c.trackId);
    if (tr?.muted) continue;
    mixClip(c, c.role === "bgm" || c.trackId === "trk_a1");
  }

  let peak = 1e-6;
  for (let i = 0; i < length; i++) {
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  if (peak > 0.98) {
    const n = 0.98 / peak;
    for (let i = 0; i < length; i++) {
      L[i] *= n;
      R[i] *= n;
    }
  }
  return out;
}

export class PreviewAudio {
  ctx: AudioContext | null = null;
  nodes: AudioBufferSourceNode[] = [];
  startedAt = 0;
  offset = 0;

  async ensure() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  stop() {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* */
      }
    }
    this.nodes = [];
  }

  async play(project: Project, from: number, duration: number) {
    this.stop();
    const ctx = await this.ensure();
    const mixed = mixProjectAudio(project, duration);
    const src = ctx.createBufferSource();
    src.buffer = mixed;
    src.connect(ctx.destination);
    const offset = Math.max(0, Math.min(from, mixed.duration - 0.01));
    src.start(0, offset);
    this.nodes = [src];
    this.startedAt = ctx.currentTime;
    this.offset = offset;
  }

  currentTime() {
    if (!this.ctx) return this.offset;
    return this.offset + (this.ctx.currentTime - this.startedAt);
  }
}
