import { describe, expect, test } from "bun:test";
import { ASPECT_SIZE, emptyProject } from "./types";
import { exportFileBase, formatOf, inferPlatform, platformById, resolvePlatform } from "./platforms";

describe("platforms", () => {
  test("defaults to TikTok 9:16", () => {
    const p = emptyProject();
    expect(p.platform).toBe("tiktok");
    expect(p.formatId).toBe("vertical");
    expect(p.aspect).toBe("9:16");
    const r = resolvePlatform(p);
    expect(r.spec.name).toBe("TikTok");
    expect(r.format.aspect).toBe("9:16");
    expect(ASPECT_SIZE[r.format.aspect]).toEqual({ w: 1080, h: 1920 });
  });

  test("YouTube default is Short 9:16 and Long is 16:9", () => {
    const yt = platformById("youtube");
    expect(yt.defaultFormat).toBe("short");
    expect(formatOf(yt, "short").aspect).toBe("9:16");
    expect(formatOf(yt, "long").aspect).toBe("16:9");
    expect(ASPECT_SIZE["16:9"]).toEqual({ w: 1920, h: 1080 });
  });

  test("Instagram Feed is 4:5 and Reels is 9:16", () => {
    const ig = platformById("instagram");
    expect(ig.defaultFormat).toBe("reels");
    expect(formatOf(ig, "reels").aspect).toBe("9:16");
    expect(formatOf(ig, "feed").aspect).toBe("4:5");
    expect(ASPECT_SIZE["4:5"]).toEqual({ w: 1080, h: 1350 });
  });

  test("Facebook default is 1:1 and LinkedIn default is Video 16:9", () => {
    expect(formatOf(platformById("facebook"), platformById("facebook").defaultFormat).aspect).toBe("1:1");
    expect(formatOf(platformById("linkedin"), platformById("linkedin").defaultFormat).aspect).toBe("16:9");
  });

  test("preview size matches export size for each format", () => {
    for (const spec of ["tiktok", "youtube", "instagram", "facebook", "linkedin"] as const) {
      const plat = platformById(spec);
      for (const fmt of plat.formats) {
        const size = ASPECT_SIZE[fmt.aspect];
        expect(size.w).toBeGreaterThan(0);
        expect(size.h).toBeGreaterThan(0);
        const r = resolvePlatform({ aspect: fmt.aspect, platform: spec, formatId: fmt.id });
        expect(ASPECT_SIZE[r.format.aspect]).toEqual(size);
      }
    }
  });

  test("filename says the platform and skips ASCII hyphen minus in the label parts", () => {
    const name = exportFileBase({
      name: "Untitled cut",
      aspect: "9:16",
      platform: "tiktok",
      formatId: "vertical",
    });
    expect(name).toContain("TikTok");
    expect(name.includes("-")).toBe(false);
  });

  test("infer 16:9 as YouTube Long", () => {
    expect(inferPlatform("16:9")).toEqual({ platform: "youtube", formatId: "long" });
  });
});
