import { normalizeIn, type Clip, type TextPreset } from "../types";
import { KIT, kitOf, isKitPreset } from "../kit/catalog";
import {
  easeOutBack,
  easeOutCubic,
  fillClassic,
  prefersReduce,
  type DrawCtx,
  type Kinetic,
} from "./overlay-fx";

export type { DrawCtx, Kinetic };
export { easeOutBack, easeOutCubic, prefersReduce, setReduceOverride } from "./overlay-fx";
export { isKitPreset };

const CAT_ORDER = [
  { src: "text", id: "kinetic" as const, name: "Kinetic" },
  { src: "image", id: "reveals" as const, name: "Reveals" },
  { src: "animation", id: "particles" as const, name: "Particles" },
  { src: "background-animation", id: "background" as const, name: "Background" },
  { src: "image-gallery", id: "gallery" as const, name: "Gallery" },
  { src: "interactive-elements", id: "interactive" as const, name: "Interactive" },
  { src: "button", id: "buttons" as const, name: "Buttons" },
  { src: "border", id: "buttons" as const, name: "Buttons" },
  { src: "cursor", id: "interactive" as const, name: "Interactive" },
];

export type OverlayCat = (typeof CAT_ORDER)[number]["id"];

function binFor(src: string): { id: OverlayCat; name: string } {
  const hit = CAT_ORDER.find((c) => c.src === src);
  return hit ? { id: hit.id, name: hit.name } : { id: "kinetic", name: "Kinetic" };
}

const names: OverlayCat[] = [];
const seen = new Set<OverlayCat>();
for (const c of CAT_ORDER) {
  if (seen.has(c.id)) continue;
  seen.add(c.id);
  names.push(c.id);
}

export const OVERLAY_CATS = names.map((id) => {
  const name = CAT_ORDER.find((c) => c.id === id)!.name;
  const items = KIT.filter((k) => binFor(k.category).id === id).map((k) => ({
    id: k.id as TextPreset,
    name: k.name,
    poster: k.posterUrl,
  }));
  return { id, name, items };
});

export type OverlayItem = { id: TextPreset; name: string; poster?: string; cat: OverlayCat };

export function overlayItems(): OverlayItem[] {
  return OVERLAY_CATS.flatMap((c) => c.items.map((item) => ({ ...item, cat: c.id })));
}

export function catForPreset(p?: TextPreset): OverlayCat {
  const n = normalizeIn(p);
  const kit = kitOf(n);
  if (kit) return binFor(kit.category).id;
  return "kinetic";
}

export function isSpecialPreset(p?: TextPreset): boolean {
  return isKitPreset(normalizeIn(p));
}

function covers(c: Clip, t: number) {
  return t >= c.start - 1e-4 && t < c.start + c.duration - 1e-6;
}

function localT(c: Clip, t: number) {
  return t - c.start;
}

export function kinetic(c: Clip, t: number): Kinetic {
  if (prefersReduce()) {
    return {
      opacity: 1,
      ty: 0,
      tx: 0,
      scale: 1,
      chars: c.text.length,
      split: 0,
      reveal: 1,
      weight: 700,
      scramble: 1,
      inP: 1,
    };
  }
  const lt = Math.max(0, localT(c, t));
  const inDur = Math.max(0.12, c.inDur ?? 0.38);
  const outDur = Math.max(0.12, c.outDur ?? 0.28);
  const outStart = Math.max(0, c.duration - outDur);
  const inP = Math.min(1, lt / inDur);
  const outP = lt > outStart ? Math.min(1, (lt - outStart) / outDur) : 0;
  const preset = normalizeIn(c.inPreset || c.preset);
  const out = c.outPreset || "fade";
  const len = c.text.length;
  let opacity = 1;
  let ty = 0;
  let tx = 0;
  let scale = 1;
  let chars = len;
  let split = 0;
  let reveal = 1;
  let weight = 600;
  let scramble = 1;

  if (isKitPreset(preset)) {
    opacity = 1;
    reveal = easeOutCubic(inP);
    scramble = easeOutCubic(inP);
  } else if (preset === "fade") {
    opacity = easeOutCubic(inP);
  } else if (preset === "rise" || preset === "fadeup") {
    opacity = easeOutCubic(inP);
    ty = (1 - easeOutCubic(inP)) * 36;
  } else if (preset === "bloom") {
    opacity = Math.min(1, inP * 1.4);
    scale = 0.72 + easeOutBack(inP) * 0.28;
  } else if (preset === "type") {
    const typeDur = Math.max(c.inDur ?? 0.45, len * 0.045);
    chars = Math.max(0, Math.floor(len * Math.min(1, lt / typeDur)));
  } else if (preset === "stamp") {
    const sp = Math.min(1, lt / 0.16);
    opacity = sp > 0 ? 1 : 0;
    scale = 1.12 - easeOutCubic(sp) * 0.12;
  } else if (preset === "drift") {
    opacity = easeOutCubic(inP);
    tx = (1 - easeOutCubic(inP)) * 40;
  } else if (preset === "split") {
    opacity = easeOutCubic(inP);
    split = (1 - easeOutCubic(inP)) * 24;
  } else if (preset === "hold") {
    opacity = 1;
  } else {
    opacity = easeOutCubic(inP);
  }

  if (out === "fade") {
    opacity *= 1 - outP;
  } else if (out === "sink") {
    opacity *= 1 - outP;
    ty += outP * 12;
  } else if (out === "scale") {
    opacity *= 1 - outP * 0.85;
    scale *= 1 - outP * 0.12;
  }

  return { opacity, ty, tx, scale, chars, split, reveal, weight, scramble, inP };
}

export function drawTitleOverlay(ctx: DrawCtx, c: Clip, t: number, w: number, h: number) {
  if (!covers(c, t) || !c.text) return;
  const preset = normalizeIn(c.inPreset || c.preset);
  if (isKitPreset(preset)) return;
  const k = kinetic(c, t);
  ctx.save();
  ctx.globalAlpha *= k.opacity;
  const cx = c.x * w + k.tx;
  const cy = c.y * h + k.ty;
  ctx.translate(cx, cy);
  ctx.scale(k.scale * c.scale, k.scale * c.scale);
  const shown = preset === "type" ? c.text.slice(0, k.chars) : c.text;
  if (shown) fillClassic(ctx, c, k, w, shown);
  ctx.restore();
}
