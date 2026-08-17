import { describe, expect, test } from "bun:test";
import { blankClip, normalizeIn } from "../types";
import { catForPreset, kinetic, overlayItems, OVERLAY_CATS, isSpecialPreset, isKitPreset } from "./overlays";
import { setReduceOverride } from "./overlay-fx";
import { KIT_ALL } from "../kit/catalog";

describe("overlay catalog", () => {
  test("FX bin lists real originkit looks without brand", () => {
    const ids = overlayItems().map((i) => i.id);
    expect(OVERLAY_CATS.map((c) => c.name)).toEqual([
      "Kinetic",
      "Reveals",
      "Particles",
      "Background",
      "Gallery",
      "Interactive",
      "Buttons",
    ]);
    expect(ids.length).toBeGreaterThanOrEqual(140);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("scrambletext");
    expect(ids).toContain("glitterwrap");
    expect(ids).toContain("starburst");
    expect(ids).toContain("pixelreveal");
    expect(ids).toContain("smokytext");
    expect(ids).toContain("textmorph");
    expect(ids).toContain("coverflowgallery");
    expect(ids).not.toContain("live-chat");
    for (const cat of OVERLAY_CATS) {
      expect(cat.items.length).toBeGreaterThan(0);
      for (const item of cat.items) {
        expect(item.name.includes("-")).toBe(false);
        expect(item.name.toLowerCase().includes("originkit")).toBe(false);
        expect(item.name.length).toBeGreaterThan(2);
        expect(catForPreset(item.id)).toBe(cat.id);
        expect(isSpecialPreset(item.id)).toBe(true);
        expect(isKitPreset(item.id)).toBe(true);
      }
    }
  });

  test("skipped widgets stay out of the bin", () => {
    const ids = new Set(overlayItems().map((i) => i.id));
    expect(ids.has("live-chat")).toBe(false);
    expect(ids.has("glitter-cursor")).toBe(false);
    expect(KIT_ALL.some((k) => k.id === "live-chat" && k.skip)).toBe(true);
  });

  test("old stub ids alias onto real modules", () => {
    expect(normalizeIn("scramble")).toBe("scrambletext");
    expect(normalizeIn("glitter")).toBe("glitterwrap");
    expect(catForPreset("scramble")).toBe("kinetic");
    expect(catForPreset("pixel")).toBe("reveals");
    expect(catForPreset("glitter")).toBe("particles");
    expect(catForPreset("snowfall")).toBe("background");
    expect(catForPreset("coverflowgallery")).toBe("gallery");
    expect(catForPreset("blackhole")).toBe("interactive");
    expect(catForPreset("neon-border")).toBe("buttons");
    expect(catForPreset("shiny-pill")).toBe("kinetic");
  });
});

describe("kinetic timing", () => {
  test("kit looks still expose an in pose", () => {
    setReduceOverride(false);
    const clip = blankClip({
      trackId: "trk_ov",
      type: "text",
      start: 0,
      duration: 2,
      text: "BESTCUT",
      preset: "scrambletext",
      inPreset: "scrambletext",
      inDur: 0.38,
      outDur: 0.28,
    });
    expect(kinetic(clip, 0.08).inP).toBeLessThan(0.4);
    expect(kinetic(clip, 1.2).inP).toBe(1);
    setReduceOverride(null);
  });
});
