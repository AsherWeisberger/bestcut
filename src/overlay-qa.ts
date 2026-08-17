import { ASPECT_SIZE, blankClip, emptyProject } from "./types";
import { overlayItems } from "./engine/overlays";
import { setReduceOverride } from "./engine/overlay-fx";
import { renderFrame } from "./engine/render";

export type OverlayQaRow = {
  id: string;
  cat: string;
  pixels: number;
  ok: boolean;
  t: number;
};

function countLit(data: Uint8ClampedArray, x0: number, y0: number, bw: number, bh: number, stride: number) {
  let n = 0;
  const x1 = Math.min(stride, x0 + bw);
  const y1 = y0 + bh;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * stride + x) * 4;
      if (data[i] > 22 || data[i + 1] > 22 || data[i + 2] > 28) n++;
    }
  }
  return n;
}

export async function runOverlayQa() {
  setReduceOverride(false);
  const { w, h } = ASPECT_SIZE["9:16"];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  const results: OverlayQaRow[] = [];
  for (const item of overlayItems()) {
    const p = emptyProject();
    p.aspect = "9:16";
    const sticker = item.cat === "stickers";
    const gallery = item.cat === "gallery";
    p.clips = [
      blankClip({
        trackId: "trk_ov",
        type: "text",
        start: 0,
        duration: 2.4,
        text: "BESTCUT",
        preset: item.id,
        inPreset: item.id,
        fontSize: sticker ? 64 : gallery ? 72 : 96,
        y: sticker ? 0.78 : 0.4,
        x: 0.5,
        inDur: 0.38,
        outDur: 0.28,
      }),
    ];
    const t = 0.24;
    renderFrame(ctx, t, p, { frames: new Map() });
    const img = ctx.getImageData(0, 0, w, h);
    const bandY = sticker ? Math.floor(h * 0.62) : Math.floor(h * 0.2);
    const pixels = countLit(img.data, 40, bandY, w - 80, Math.floor(h * 0.42), w);
    results.push({ id: item.id, cat: item.cat, pixels, ok: pixels > 60, t });
  }

  const comboProject = emptyProject();
  comboProject.aspect = "9:16";
  comboProject.clips = [
    blankClip({
      trackId: "trk_ov",
      type: "text",
      start: 0,
      duration: 2,
      text: "KINETIC",
      preset: "scramble",
      inPreset: "scramble",
      y: 0.28,
      fontSize: 88,
    }),
    blankClip({
      trackId: "trk_ov",
      type: "text",
      start: 0,
      duration: 2,
      text: "REVEAL",
      preset: "pixel",
      inPreset: "pixel",
      y: 0.48,
      fontSize: 88,
    }),
    blankClip({
      trackId: "trk_ov",
      type: "text",
      start: 0,
      duration: 2,
      text: "SPARK",
      preset: "spark",
      inPreset: "spark",
      y: 0.68,
      fontSize: 88,
    }),
  ];
  renderFrame(ctx, 0.24, comboProject, { frames: new Map() });
  const comboImg = ctx.getImageData(0, 0, w, h);
  const combo = {
    kinetic: countLit(comboImg.data, 40, Math.floor(h * 0.16), w - 80, Math.floor(h * 0.18), w),
    reveal: countLit(comboImg.data, 40, Math.floor(h * 0.38), w - 80, Math.floor(h * 0.18), w),
    particle: countLit(comboImg.data, 40, Math.floor(h * 0.58), w - 80, Math.floor(h * 0.18), w),
  };
  const payload = {
    results,
    combo,
    comboOk: combo.kinetic > 80 && combo.reveal > 80 && combo.particle > 80,
    failed: results.filter((r) => !r.ok).map((r) => r.id),
    png: canvas.toDataURL("image/png"),
  };
  (window as unknown as { __OVERLAY_QA: typeof payload }).__OVERLAY_QA = payload;
  let pre = document.getElementById("overlay-qa");
  if (!pre) {
    pre = document.createElement("pre");
    pre.id = "overlay-qa";
    document.body.appendChild(pre);
  }
  pre.textContent = JSON.stringify(
    { results, combo, comboOk: payload.comboOk, failed: payload.failed },
    null,
    2,
  );
  return payload;
}
