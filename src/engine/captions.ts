import { blankClip, uid, type CaptionStyle, type Clip } from "../types";

export function parseSrt(text: string): { start: number; end: number; text: string }[] {
  const blocks = text.replace(/\r/g, "").split(/\n\n+/);
  const out: { start: number; end: number; text: string }[] = [];
  const ts = (s: string) => {
    const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return 0;
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, "0").slice(0, 3) / 1000;
  };
  for (const b of blocks) {
    const lines = b.split("\n").filter(Boolean);
    const idx = lines.findIndex((l) => l.includes("-->"));
    if (idx < 0) continue;
    const [a, c] = lines[idx].split("-->");
    const body = lines.slice(idx + 1).join(" ").trim();
    if (!body) continue;
    out.push({ start: ts(a), end: ts(c), text: body });
  }
  return out;
}

function captionClip(partial: Partial<Clip> & { start: number; duration: number; text: string }): Clip {
  return blankClip({
    id: uid("cl"),
    trackId: "trk_cc",
    type: "caption",
    captionStyle: "stroke",
    y: 0.72,
    captionGroup: true,
    ...partial,
  });
}

export function srtToClips(srt: string, trackId = "trk_cc"): Clip[] {
  return parseSrt(srt).map((c) =>
    captionClip({
      trackId,
      start: c.start,
      duration: Math.max(0.4, c.end - c.start),
      text: c.text,
    }),
  );
}

function chunkLong(s: string, max = 64): string[] {
  if (s.length <= max) return [s];
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.4) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function splitSentences(text: string, start: number, dur: number, style: CaptionStyle = "stroke"): Clip[] {
  const raw = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => chunkLong(s, 64));
  if (!raw.length) return [];
  const weights = raw.map((s) => Math.max(8, s.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = start;
  return raw.map((p, i) => {
    const d = Math.max(0.8, dur * (weights[i] / sum));
    const clip = captionClip({
      start: t,
      duration: d,
      text: p,
      captionStyle: style,
    });
    t += d;
    return clip;
  });
}

export function captionsToSrt(clips: Clip[]): string {
  const list = clips.filter((c) => c.type === "caption").sort((a, b) => a.start - b.start);
  const ts = (t: number) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 1000);
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
  };
  return list
    .map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.start + c.duration)}\n${c.text}\n`)
    .join("\n");
}
