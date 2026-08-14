import { blankClip, uid, type Clip } from "../types";

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

export function srtToClips(srt: string, trackId: string): Clip[] {
  return parseSrt(srt).map((c) =>
    blankClip({
      id: uid("cl"),
      trackId,
      type: "caption",
      start: c.start,
      duration: Math.max(0.4, c.end - c.start),
      text: c.text,
    }),
  );
}

export function splitSentences(text: string, start: number, dur: number): Clip[] {
  const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return [];
  const each = dur / parts.length;
  return parts.map((p, i) =>
    blankClip({
      id: uid("cl"),
      trackId: "trk_cc",
      type: "caption",
      start: start + i * each,
      duration: Math.max(0.8, each),
      text: p,
    }),
  );
}
