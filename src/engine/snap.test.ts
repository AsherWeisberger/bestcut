import { describe, expect, test } from "bun:test";
import { snapTime } from "./snap";

describe("snapTime", () => {
  test("drag from playhead at 75s to 0 with Snap+Mag lands on 0", () => {
    const { t, hit } = snapTime(0, [0, 75], true, { zoom: 80, mag: true, origin: 75 });
    expect(t).toBe(0);
    expect(hit).toBe(0);
  });

  test("does not trap on the playhead you are dragging away from", () => {
    const { t, hit } = snapTime(74.7, [0, 75], true, { zoom: 80, mag: true, origin: 75 });
    expect(t).toBeCloseTo(74.7, 5);
    expect(hit).toBeNull();
  });

  test("strong snap at 0 while Mag is on", () => {
    const { t, hit } = snapTime(0.45, [0, 12], true, { zoom: 80, mag: true, origin: 12 });
    expect(t).toBe(0);
    expect(hit).toBe(0);
  });

  test("still snaps to playhead when approaching it", () => {
    const { t, hit } = snapTime(75.1, [0, 75], true, { zoom: 80, mag: true, origin: 10 });
    expect(t).toBe(75);
    expect(hit).toBe(75);
  });

  test("start may be 0 with snapping off", () => {
    const { t, hit } = snapTime(-2, [75], false, { zoom: 80, mag: false, origin: 75 });
    expect(t).toBe(0);
    expect(hit).toBeNull();
  });
});
