import { blankClip, clipEnd, clipSpeed, uid, type Clip } from "../types";
import { useEditor } from "../store";
import { media } from "./media";

export type AsrChunk = { start: number; end: number; text: string };
type ProgressFn = (message: string, ratio?: number) => void;

function resampleMono16k(buf: AudioBuffer, t0: number, dur: number): Float32Array {
  const sr = buf.sampleRate;
  const start = Math.max(0, Math.floor(t0 * sr));
  const end = Math.min(buf.length, Math.floor((t0 + dur) * sr));
  const ratio = sr / 16000;
  const length = Math.max(1, Math.floor((end - start) / ratio));
  const out = new Float32Array(length);
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  for (let i = 0; i < length; i++) {
    const si = start + Math.floor(i * ratio);
    if (si >= end) break;
    const l = ch0[si] || 0;
    const r = ch1 ? ch1[si] || 0 : l;
    out[i] = (l + r) * 0.5;
  }
  return out;
}

let whisperPipe: Promise<(audio: Float32Array, opts?: object) => Promise<unknown>> | null = null;

async function loadWhisper(onProgress: ProgressFn) {
  if (whisperPipe) return whisperPipe;
  onProgress("Downloading Whisper-tiny…", 0.04);
  whisperPipe = buildWhisper(onProgress);
  try { return await whisperPipe; } catch (err) { whisperPipe = null; throw err; }
}
const MODEL = "Xenova/whisper-tiny.en";
const HF_LIB = "https://esm.sh/@huggingface/transformers@3.8.1";

async function buildWhisper(onProgress: ProgressFn) {
  const mod = (await import(/* @vite-ignore */ HF_LIB)) as {
    pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<(audio: Float32Array, opts?: object) => Promise<unknown>>;
    env?: { allowLocalModels?: boolean; backends?: { onnx?: { wasm?: { numThreads?: number } } } };
  };
  if (mod.env) {
    mod.env.allowLocalModels = false;
    try { if (mod.env.backends?.onnx?.wasm) mod.env.backends.onnx.wasm.numThreads = 1; } catch { /* Pages: no COOP */ }
  }
  return mod.pipeline("automatic-speech-recognition", MODEL, {
    dtype: "q8",
    progress_callback: (p: { status?: string; progress?: number; file?: string }) => {
      if (p?.status === "progress" && typeof p.progress === "number") {
        onProgress("Downloading model… " + Math.round(p.progress) + "%", 0.05 + 0.45 * (p.progress / 100));
      } else if (p?.status === "ready") onProgress("Model ready", 0.52);
      else if (p?.file) onProgress("Downloading " + String(p.file).split("/").pop() + "…");
    },
  });
}

function parseWhisper(result: unknown, fallbackDur: number): AsrChunk[] {
  const r = result as { text?: string; chunks?: { text?: string; timestamp?: [number, number] }[] };
  if (Array.isArray(r?.chunks) && r.chunks.length) {
    const out: AsrChunk[] = [];
    for (const c of r.chunks) {
      const text = String(c.text || "").trim();
      if (!text) continue;
      const start = Number(c.timestamp?.[0] ?? 0) || 0;
      const end = Number(c.timestamp?.[1] ?? start + 1.2) || start + 1.2;
      out.push({ start, end: Math.max(end, start + 0.4), text });
    }
    return out;
  }
  const text = String(r?.text || "").trim();
  if (!text) return [];
  const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const each = fallbackDur / Math.max(1, parts.length);
  return parts.map((p, i) => ({ start: i * each, end: (i + 1) * each, text: p }));
}

export function chunksToClips(chunks: AsrChunk[], offset: number): Clip[] {
  return chunks.map((c) =>
    blankClip({
      id: uid("cl"),
      trackId: "trk_cc",
      type: "caption",
      start: offset + c.start,
      duration: Math.max(0.45, c.end - c.start),
      text: c.text,
      fontSize: 48,
      y: 0.72,
    }),
  );
}

export function supportsWebSpeech() {
  return typeof window !== "undefined" && !!( (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition || (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition );
}

type RecCtor = new () => {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void;
  onresult: ((ev: { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export async function transcribeWebSpeech(duration: number, onProgress: ProgressFn): Promise<AsrChunk[]> {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) throw new Error("Chrome speech is not in this browser");
  onProgress("Browser speech (Chrome) — play the clip with sound on.", 0.08);
  return new Promise((resolve, reject) => {
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    const chunks: AsrChunk[] = [];
    const t0 = performance.now();
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r.isFinal) continue;
        const text = String(r[0]?.transcript || "").trim();
        if (!text) continue;
        const t = (performance.now() - t0) / 1000;
        const start = Math.max(0, t - 1.8);
        chunks.push({ start, end: Math.min(duration, Math.max(start + 0.8, t + 0.15)), text });
        onProgress("Heard: " + text.slice(0, 48), Math.min(0.95, t / Math.max(0.4, duration)));
      }
    };
    rec.onerror = (e) => {
      if (chunks.length) resolve(chunks);
      else reject(new Error(e.error === "not-allowed" ? "Chrome speech needs permission" : "Browser speech failed"));
    };
    rec.onend = () => resolve(chunks);
    rec.start();
    window.setTimeout(() => { try { rec.stop(); } catch { /* done */ } }, Math.min(120000, Math.max(2800, duration * 1000 + 500)));
  });
}

export async function autoCaption(opts: { clipId?: string | null; onProgress: ProgressFn }): Promise<{ engine: "whisper" | "webspeech"; count: number }> {
  try {
    return await autoCaptionInner(opts);
  } catch (err) {
    console.warn("autoCaption", err);
    throw err instanceof Error ? err : new Error("Could not transcribe in this tab.");
  }
}

async function autoCaptionInner(opts: { clipId?: string | null; onProgress: ProgressFn }): Promise<{ engine: "whisper" | "webspeech"; count: number }> {
  const ed = useEditor.getState();
  const targets = ed.project.clips.filter((c) => {
    if (c.type !== "video" && c.type !== "audio") return false;
    if (opts.clipId) return c.id === opts.clipId;
    return !!c.assetId;
  });
  if (!targets.length) throw new Error("Drop a talking-head clip, then run Caption pass.");
  const made: Clip[] = [];
  const ranges: { start: number; end: number }[] = [];
  let engine: "whisper" | "webspeech" = "whisper";
  for (const clip of targets) {
    ranges.push({ start: clip.start, end: clipEnd(clip) });
    const buf = clip.assetId ? media.audioBuffers.get(clip.assetId) : undefined;
    if (buf && buf.duration > 0.05) {
      try {
        opts.onProgress("Preparing audio…", 0.02);
        const pcm = resampleMono16k(buf, clip.trimIn, Math.max(0.05, clip.duration * clipSpeed(clip)));
        const transcriber = await loadWhisper(opts.onProgress);
        opts.onProgress("Transcribing…", 0.6);
        const result = await transcriber(pcm, { return_timestamps: true, chunk_length_s: 30 });
        made.push(...chunksToClips(parseWhisper(result, clip.duration), clip.start));
        engine = "whisper";
        continue;
      } catch (err) {
        console.warn("Whisper failed, trying browser speech", err);
        engine = "webspeech";
      }
    }
    if (!supportsWebSpeech()) throw new Error("No decoded audio, and Whisper could not load. Import an SRT instead.");
    ed.setPlayhead(clip.start);
    ed.setPlaying(true);
    try {
      const chunks = await transcribeWebSpeech(clip.duration, opts.onProgress);
      made.push(...chunksToClips(chunks, clip.start));
      engine = "webspeech";
    } finally {
      ed.setPlaying(false);
    }
  }
  if (!made.length) throw new Error("No speech detected.");
  ed.replaceCaptions(ranges, made);
  return { engine, count: made.length };
}
