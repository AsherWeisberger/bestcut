import { describe, expect, test } from "bun:test";
import { sourceTime } from "./media";

describe("sourceTime", () => {
  test("applies speed so export reads the right source sample", () => {
    const clip = { trimIn: 1, start: 2, speed: 2, duration: 1 };
    expect(sourceTime(clip, 2)).toBeCloseTo(1, 5);
    expect(sourceTime(clip, 2.5)).toBeCloseTo(2, 5);
  });

  test("clamps past the clip so transitions do not seek off the end", () => {
    const clip = { trimIn: 0, start: 0, speed: 1, duration: 2 };
    const st = sourceTime(clip, 5);
    expect(st).toBeLessThan(2);
    expect(st).toBeGreaterThanOrEqual(0);
  });
});
