import { describe, expect, test } from "bun:test";
import { blankClip, clipEnd, clipSpeed } from "../types";
import { durationForSpeed, rangeSpeedPieces, setClipSpeedResult, sourceAt, sourceSpan } from "./speed";

function video(partial: Partial<ReturnType<typeof blankClip>> = {}) {
  return blankClip({
    trackId: "trk_v1",
    type: "video",
    start: 0,
    duration: 4,
    sourceDuration: 4,
    trimIn: 0,
    speed: 1,
    ...partial,
  });
}

describe("clip speed", () => {
  test("2x shortens timeline duration and keeps source span", () => {
    const clip = video();
    const { next, delta } = setClipSpeedResult(clip, 2);
    expect(next.speed).toBe(2);
    expect(next.duration).toBeCloseTo(2, 5);
    expect(delta).toBeCloseTo(-2, 5);
    expect(sourceSpan(next)).toBeCloseTo(4, 5);
  });

  test("0.5x lengthens timeline duration", () => {
    const clip = video();
    const { next } = setClipSpeedResult(clip, 0.5);
    expect(next.duration).toBeCloseTo(8, 5);
  });

  test("10x is allowed and clamps to a minimum duration", () => {
    const clip = video({ duration: 0.2, sourceDuration: 0.2 });
    const { next } = setClipSpeedResult(clip, 10);
    expect(next.duration).toBeGreaterThanOrEqual(0.08);
    expect(clipSpeed(next)).toBe(10);
  });

  test("sourceAt stays inside the used source window", () => {
    const clip = video({ duration: 2, speed: 2, sourceDuration: 4 });
    expect(sourceAt(clip, clip.start)).toBeCloseTo(0, 5);
    expect(sourceAt(clip, clipEnd(clip))).toBeLessThan(clip.trimIn + sourceSpan(clip));
    expect(sourceAt(clip, clipEnd(clip) + 2)).toBeLessThan(clip.trimIn + sourceSpan(clip));
  });
});

describe("range speed", () => {
  test("In/Out stretch splits into three pieces and shortens the middle", () => {
    const clip = video();
    const { pieces, delta, selectId } = rangeSpeedPieces(clip, 1, 3, 2);
    expect(pieces).toHaveLength(3);
    expect(pieces[0].duration).toBeCloseTo(1, 5);
    expect(pieces[0].speed).toBe(1);
    expect(pieces[1].speed).toBe(2);
    expect(pieces[1].duration).toBeCloseTo(1, 5);
    expect(pieces[1].id).toBe(selectId);
    expect(pieces[2].start).toBeCloseTo(pieces[1].start + pieces[1].duration, 5);
    expect(delta).toBeCloseTo(-1, 5);
  });

  test("full-clip range is a whole-clip speed change", () => {
    const clip = video();
    const { pieces } = rangeSpeedPieces(clip, 0, 4, 4);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].speed).toBe(4);
    expect(pieces[0].duration).toBeCloseTo(1, 5);
  });

  test("durationForSpeed never returns below the floor", () => {
    expect(durationForSpeed(0.001, 10)).toBeGreaterThanOrEqual(0.08);
  });
});
