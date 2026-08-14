import { clipEnd, clipSpeed, uid, type Clip, type TransitionKind } from "../types";

const MIN = 0.08;

export function sourceAt(clip: Clip, t: number): number {
  return clip.trimIn + (t - clip.start) * clipSpeed(clip);
}

export function sourceSpan(clip: Clip): number {
  return Math.max(0, clip.duration * clipSpeed(clip));
}

export function durationForSpeed(span: number, speed: number): number {
  const spd = speed > 0 ? speed : 1;
  return Math.max(MIN, span / spd);
}

export function setClipSpeedResult(clip: Clip, speed: number): { next: Clip; delta: number } {
  const span = sourceSpan(clip);
  const duration = durationForSpeed(span, speed);
  return { next: { ...clip, speed, duration }, delta: duration - clip.duration };
}

export function rangeSpeedPieces(
  clip: Clip,
  inT: number,
  outT: number,
  speed: number,
): { pieces: Clip[]; delta: number; selectId: string } {
  const start = clip.start;
  const end = clipEnd(clip);
  let a = Math.min(inT, outT);
  let b = Math.max(inT, outT);
  a = Math.max(start, Math.min(a, end));
  b = Math.max(start, Math.min(b, end));
  if (b - a < MIN) {
    b = Math.min(end, a + MIN);
    if (b - a < MIN) a = Math.max(start, b - MIN);
  }

  const coversStart = a <= start + MIN;
  const coversEnd = b >= end - MIN;
  if (coversStart && coversEnd) {
    const { next, delta } = setClipSpeedResult(clip, speed);
    return { pieces: [next], delta, selectId: next.id };
  }

  const srcA = sourceAt(clip, a);
  const srcB = sourceAt(clip, b);
  const midDur = durationForSpeed(Math.max(0, srcB - srcA), speed);
  const delta = midDur - (b - a);
  const pieces: Clip[] = [];

  if (!coversStart) {
    pieces.push({ ...clip, duration: a - start });
  }

  const mid: Clip = {
    ...clip,
    id: coversStart ? clip.id : uid("cl"),
    start: a,
    duration: midDur,
    trimIn: srcA,
    speed,
    transitionIn: (coversStart ? clip.transitionIn : "cut") as TransitionKind,
  };
  pieces.push(mid);

  if (!coversEnd) {
    pieces.push({
      ...clip,
      id: uid("cl"),
      start: a + midDur,
      duration: end - b,
      trimIn: srcB,
      speed: clip.speed,
      transitionIn: "cut",
    });
  }

  return { pieces, delta, selectId: mid.id };
}

export function replaceClipWithPieces(
  clips: Clip[],
  clip: Clip,
  pieces: Clip[],
  delta: number,
): Clip[] {
  const originalEnd = clipEnd(clip);
  const pieceIds = new Set(pieces.map((p) => p.id));
  const rest = clips.filter((c) => c.id !== clip.id);
  const next = [...rest, ...pieces];
  return next.map((c) => {
    if (pieceIds.has(c.id)) return c;
    if (c.trackId === clip.trackId && c.start >= originalEnd - 1e-4) {
      return { ...c, start: Math.max(0, c.start + delta) };
    }
    return c;
  });
}
