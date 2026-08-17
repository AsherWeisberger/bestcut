import { describe, expect, test } from "bun:test";
import { blankClip, emptyProject } from "../types";
import { kinetic, visibleMediaClips } from "./render";

function shot(start: number, duration: number, transitionIn: "cut" | "dissolve" | "slide" | "wipe" | "fade") {
  return blankClip({
    trackId: "trk_v1",
    type: "image",
    start,
    duration,
    sourceDuration: duration,
    transitionIn,
    transitionFrames: 8,
  });
}

describe("transitions", () => {
  test("dissolve keeps the outgoing clip in the frame bank", () => {
    const p = emptyProject();
    const a = shot(0, 2, "cut");
    const b = shot(2, 2, "dissolve");
    p.clips = [a, b];
    const hits = visibleMediaClips(p, 2.05);
    expect(hits.some((c) => c.id === a.id)).toBe(true);
    expect(hits.some((c) => c.id === b.id)).toBe(true);
  });

  test("slide and wipe also keep the outgoing clip", () => {
    for (const kind of ["slide", "wipe"] as const) {
      const p = emptyProject();
      const a = shot(0, 2, "cut");
      const b = shot(2, 2, kind);
      p.clips = [a, b];
      const hits = visibleMediaClips(p, 2.1);
      expect(hits.some((c) => c.id === a.id)).toBe(true);
    }
  });

  test("cut does not keep the previous clip past its end", () => {
    const p = emptyProject();
    const a = shot(0, 2, "cut");
    const b = shot(2, 2, "cut");
    p.clips = [a, b];
    const hits = visibleMediaClips(p, 2.05);
    expect(hits.some((c) => c.id === a.id)).toBe(false);
    expect(hits.some((c) => c.id === b.id)).toBe(true);
  });
});

describe("kinetic titles", () => {
  test("each advertised in-preset produces a distinct first-frame pose", () => {
    const presets = ["rise", "bloom", "fade", "type", "stamp", "drift", "split", "hold"] as const;
    const poses = presets.map((preset) => {
      const clip = blankClip({
        trackId: "trk_ov",
        type: "text",
        start: 0,
        duration: 2,
        text: "BESTCUT",
        preset,
        inPreset: preset,
        inDur: 0.38,
        outDur: 0.28,
      });
      return { preset, k: kinetic(clip, 0.08) };
    });
    expect(poses.find((p) => p.preset === "hold")?.k.opacity).toBe(1);
    expect(poses.find((p) => p.preset === "fade")?.k.opacity).toBeLessThan(1);
    expect(poses.find((p) => p.preset === "rise")?.k.ty).toBeGreaterThan(0);
    expect(poses.find((p) => p.preset === "drift")?.k.tx).toBeGreaterThan(0);
    expect(poses.find((p) => p.preset === "split")?.k.split).toBeGreaterThan(0);
    expect(poses.find((p) => p.preset === "bloom")?.k.scale).toBeLessThan(1);
    expect(poses.find((p) => p.preset === "type")?.k.chars).toBeLessThan("BESTCUT".length);
  });

  test("scramble morph weight typewriter pixel and dust have distinct in poses", () => {
    const mk = (preset: "scramble" | "morph" | "weight" | "typewriter" | "pixel" | "mask" | "brush" | "dust") =>
      blankClip({
        trackId: "trk_ov",
        type: "text",
        start: 0,
        duration: 2,
        text: "BESTCUT",
        preset,
        inPreset: preset,
        inDur: 0.38,
        outDur: 0.28,
      });
    const early = 0.08;
    expect(kinetic(mk("scramble"), early).scramble).toBeLessThan(1);
    expect(kinetic(mk("scramble"), 1.2).scramble).toBe(1);
    expect(kinetic(mk("morph"), early).scale).toBeLessThan(1);
    expect(kinetic(mk("weight"), early).weight).toBeLessThan(500);
    expect(kinetic(mk("typewriter"), early).chars).toBeLessThan("BESTCUT".length);
    expect(kinetic(mk("pixel"), early).reveal).toBeLessThan(0.6);
    expect(kinetic(mk("mask"), early).reveal).toBeLessThan(0.6);
    expect(kinetic(mk("brush"), 1.2).reveal).toBe(1);
    expect(kinetic(mk("dust"), early).reveal).toBeLessThan(1);
  });
});
