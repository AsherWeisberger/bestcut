import { normalizeIn, type Clip, type TextPreset } from "../types";
import {
  drawOverlayFx,
  easeOutBack,
  easeOutCubic,
  fillClassic,
  prefersReduce,
  type DrawCtx,
  type Kinetic,
} from "./overlay-fx";

export type { DrawCtx, Kinetic };
export { easeOutBack, easeOutCubic, prefersReduce, setReduceOverride } from "./overlay-fx";

export const OVERLAY_CATS = [
  {
    id: "kinetic" as const,
    name: "Kinetic",
    items: [
      { id: "scramble" as TextPreset, name: "Scramble" },
      { id: "morph" as TextPreset, name: "Morph" },
      { id: "weight" as TextPreset, name: "Weight" },
      { id: "typewriter" as TextPreset, name: "Typewriter" },
      { id: "glitchtext" as TextPreset, name: "Glitch text" },
      { id: "smoky" as TextPreset, name: "Smoky" },
      { id: "spotlight" as TextPreset, name: "Spotlight" },
      { id: "textwave" as TextPreset, name: "Text wave" },
      { id: "flicker" as TextPreset, name: "Flicker" },
      { id: "letterswap" as TextPreset, name: "Letter swap" },
      { id: "charwaves" as TextPreset, name: "Character waves" },
      { id: "spring" as TextPreset, name: "Spring" },
      { id: "vaporize" as TextPreset, name: "Vaporize" },
      { id: "fluidtext" as TextPreset, name: "Fluid text" },
      { id: "staggerrise" as TextPreset, name: "Stagger rise" },
      { id: "letterdrop" as TextPreset, name: "Letter drop" },
      { id: "rolling" as TextPreset, name: "Rolling letters" },
      { id: "textnoise" as TextPreset, name: "Text noise" },
      { id: "spiral" as TextPreset, name: "Spiral text" },
      { id: "letterswing" as TextPreset, name: "Letter swing" },
      { id: "textwipe" as TextPreset, name: "Text wipe" },
      { id: "flip" as TextPreset, name: "Mechanical flip" },
      { id: "appear" as TextPreset, name: "Appear" },
      { id: "coloursweep" as TextPreset, name: "Colour sweep" },
      { id: "elastic" as TextPreset, name: "Elastic" },
      { id: "falling" as TextPreset, name: "Falling" },
      { id: "emerge" as TextPreset, name: "Text emerge" },
      { id: "typesequence" as TextPreset, name: "Type sequence" },
      { id: "gradient" as TextPreset, name: "Gradient text" },
      { id: "unfold" as TextPreset, name: "Unfold" },
    ],
  },
  {
    id: "reveals" as const,
    name: "Reveals",
    items: [
      { id: "pixel" as TextPreset, name: "Pixel" },
      { id: "mask" as TextPreset, name: "Mask" },
      { id: "brush" as TextPreset, name: "Brush" },
      { id: "fadeup" as TextPreset, name: "Fade up" },
      { id: "dither" as TextPreset, name: "Dither" },
      { id: "focus" as TextPreset, name: "Focus" },
      { id: "imagefold" as TextPreset, name: "Image fold" },
      { id: "pixelunfold" as TextPreset, name: "Pixel unfold" },
      { id: "fluidimage" as TextPreset, name: "Fluid image" },
      { id: "imageripple" as TextPreset, name: "Image ripple" },
      { id: "ascii" as TextPreset, name: "Ascii reveal" },
      { id: "shine" as TextPreset, name: "Shine" },
    ],
  },
  {
    id: "particles" as const,
    name: "Particles",
    items: [
      { id: "dust" as TextPreset, name: "Dust" },
      { id: "spark" as TextPreset, name: "Spark" },
      { id: "vapor" as TextPreset, name: "Vapor" },
      { id: "starburst" as TextPreset, name: "Star burst" },
      { id: "glitter" as TextPreset, name: "Glitter" },
      { id: "tunnel" as TextPreset, name: "Particle tunnel" },
      { id: "emoji" as TextPreset, name: "Emoji particle" },
      { id: "stardust" as TextPreset, name: "Stardust" },
      { id: "snow" as TextPreset, name: "Snow" },
    ],
  },
  {
    id: "glitch" as const,
    name: "Glitch",
    items: [
      { id: "glitch" as TextPreset, name: "Glitch" },
      { id: "distort" as TextPreset, name: "Text distortion" },
      { id: "inkbleed" as TextPreset, name: "Ink bleed" },
    ],
  },
  {
    id: "gallery" as const,
    name: "Gallery",
    items: [{ id: "imagestack" as TextPreset, name: "Image stack" }],
  },
  {
    id: "stickers" as const,
    name: "Stickers",
    items: [
      { id: "neon" as TextPreset, name: "Neon border" },
      { id: "pill" as TextPreset, name: "Shiny pill" },
    ],
  },
];

export type OverlayCat = (typeof OVERLAY_CATS)[number]["id"];

export function overlayItems() {
  return OVERLAY_CATS.flatMap((c) => c.items.map((item) => ({ ...item, cat: c.id })));
}

const REVEAL_SET = new Set<TextPreset>(OVERLAY_CATS.find((c) => c.id === "reveals")!.items.map((i) => i.id));
const PARTICLE_SET = new Set<TextPreset>(OVERLAY_CATS.find((c) => c.id === "particles")!.items.map((i) => i.id));
const GLITCH_SET = new Set<TextPreset>(OVERLAY_CATS.find((c) => c.id === "glitch")!.items.map((i) => i.id));
const GALLERY_SET = new Set<TextPreset>(OVERLAY_CATS.find((c) => c.id === "gallery")!.items.map((i) => i.id));
const STICKER_SET = new Set<TextPreset>(OVERLAY_CATS.find((c) => c.id === "stickers")!.items.map((i) => i.id));
const SPECIAL = new Set<TextPreset>(overlayItems().map((i) => i.id));

export function catForPreset(p?: TextPreset): OverlayCat {
  const n = normalizeIn(p);
  if (REVEAL_SET.has(n)) return "reveals";
  if (PARTICLE_SET.has(n)) return "particles";
  if (GLITCH_SET.has(n)) return "glitch";
  if (GALLERY_SET.has(n)) return "gallery";
  if (STICKER_SET.has(n)) return "stickers";
  return "kinetic";
}

export function isSpecialPreset(p?: TextPreset): boolean {
  return SPECIAL.has(normalizeIn(p));
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

  if (preset === "fade") {
    opacity = easeOutCubic(inP);
  } else if (preset === "rise" || preset === "fadeup") {
    opacity = easeOutCubic(inP);
    ty = (1 - easeOutCubic(inP)) * 36;
  } else if (preset === "bloom") {
    opacity = Math.min(1, inP * 1.4);
    scale = 0.72 + easeOutBack(inP) * 0.28;
  } else if (preset === "type" || preset === "typewriter" || preset === "typesequence") {
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
  } else if (preset === "scramble" || preset === "letterswap" || preset === "ascii") {
    scramble = easeOutCubic(inP);
    opacity = 1;
  } else if (preset === "morph" || preset === "appear" || preset === "unfold" || preset === "elastic" || preset === "flip") {
    opacity = easeOutCubic(inP);
    scale = 0.35 + easeOutBack(inP) * 0.65;
  } else if (preset === "weight") {
    opacity = easeOutCubic(Math.min(1, inP * 1.35));
    weight = 200 + easeOutCubic(inP) * 500;
  } else if (REVEAL_SET.has(preset) || preset === "textwipe" || preset === "emerge" || preset === "inkbleed") {
    reveal = easeOutCubic(inP);
    opacity = 1;
  } else if (PARTICLE_SET.has(preset) || preset === "vaporize") {
    opacity = easeOutCubic(inP);
    reveal = easeOutCubic(inP);
  } else if (preset === "flicker") {
    opacity = 0.42 + easeOutCubic(inP) * 0.58;
  } else if (isSpecialPreset(preset)) {
    opacity = Math.min(1, 0.35 + easeOutCubic(inP) * 0.65);
    reveal = easeOutCubic(inP);
    scramble = easeOutCubic(inP);
  } else {
    opacity = 1;
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
  const k = kinetic(c, t);
  const preset = normalizeIn(c.inPreset || c.preset);
  ctx.save();
  ctx.globalAlpha *= k.opacity;
  const cx = c.x * w + k.tx;
  const cy = c.y * h + k.ty;
  ctx.translate(cx, cy);
  ctx.scale(k.scale * c.scale, k.scale * c.scale);
  if (isSpecialPreset(preset) && preset !== "fadeup") {
    drawOverlayFx(ctx, c, t, w, k);
  } else {
    const shown = preset === "type" ? c.text.slice(0, k.chars) : c.text;
    if (shown) fillClassic(ctx, c, k, w, shown);
  }
  ctx.restore();
}
