import { describe, expect, test } from "bun:test";
import { blankClip } from "../types";
import { catForPreset, kinetic, overlayItems, OVERLAY_CATS, isSpecialPreset } from "./overlays";
import { setReduceOverride } from "./overlay-fx";

describe("overlay catalog", () => {
  test("every look has a category and no hyphen in the name", () => {
    const ids = overlayItems().map((i) => i.id);
    expect(ids.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ids).size).toBe(ids.length);
    for (const cat of OVERLAY_CATS) {
      expect(cat.items.length).toBeGreaterThan(0);
      for (const item of cat.items) {
        expect(item.name.includes("-")).toBe(false);
        expect(item.name.length).toBeGreaterThan(2);
        expect(catForPreset(item.id)).toBe(cat.id);
        expect(isSpecialPreset(item.id)).toBe(true);
      }
    }
  });

  test("kept kinetic reveal and particle looks stay in their bins", () => {
    expect(catForPreset("scramble")).toBe("kinetic");
    expect(catForPreset("pixel")).toBe("reveals");
    expect(catForPreset("dust")).toBe("particles");
    expect(catForPreset("glitch")).toBe("glitch");
    expect(catForPreset("imagestack")).toBe("gallery");
    expect(catForPreset("neon")).toBe("stickers");
  });
});

describe("kinetic timing", () => {
  test("new looks have a moving in pose then settle", () => {
    setReduceOverride(false);
    const sample = ["glitchtext", "dither", "starburst", "inkbleed", "imagestack", "pill", "spiral", "ascii"] as const;
    for (const preset of sample) {
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
      const early = kinetic(clip, 0.08);
      const late = kinetic(clip, 1.2);
      expect(early.inP).toBeLessThan(0.4);
      expect(late.inP).toBe(1);
      expect(late.opacity).toBeGreaterThan(0.5);
    }
    setReduceOverride(null);
  });

  test("reduced motion snaps to a settled frame", () => {
    setReduceOverride(true);
    const clip = blankClip({
      trackId: "trk_ov",
      type: "text",
      start: 0,
      duration: 2,
      text: "BESTCUT",
      preset: "spiral",
      inPreset: "spiral",
    });
    const k = kinetic(clip, 0.02);
    expect(k.inP).toBe(1);
    expect(k.reveal).toBe(1);
    expect(k.opacity).toBe(1);
    expect(k.ty).toBe(0);
    setReduceOverride(null);
  });
});
