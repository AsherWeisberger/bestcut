import { normalizeIn, type Clip, type TextPreset } from "../types";

export type DrawCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type Kinetic = {
  opacity: number;
  ty: number;
  tx: number;
  scale: number;
  chars: number;
  split: number;
  reveal: number;
  weight: number;
  scramble: number;
  inP: number;
};

export const OVERLAY_CATS = [
  {
    id: "kinetic" as const,
    name: "Kinetic",
    items: [
      { id: "scramble" as TextPreset, name: "Scramble" },
      { id: "morph" as TextPreset, name: "Morph" },
      { id: "weight" as TextPreset, name: "Weight" },
      { id: "typewriter" as TextPreset, name: "Typewriter" },
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
    ],
  },
  {
    id: "particles" as const,
    name: "Particles",
    items: [
      { id: "dust" as TextPreset, name: "Dust" },
      { id: "spark" as TextPreset, name: "Spark" },
      { id: "vapor" as TextPreset, name: "Vapor" },
    ],
  },
];

export type OverlayCat = (typeof OVERLAY_CATS)[number]["id"];

const REVEAL_SET = new Set<TextPreset>(["pixel", "mask", "brush", "fadeup"]);
const PARTICLE_SET = new Set<TextPreset>(["dust", "spark", "vapor"]);
const SPECIAL = new Set<TextPreset>([
  "scramble",
  "morph",
  "weight",
  "typewriter",
  "pixel",
  "mask",
  "brush",
  "fadeup",
  "dust",
  "spark",
  "vapor",
]);

export function catForPreset(p?: TextPreset): OverlayCat {
  const n = normalizeIn(p);
  if (REVEAL_SET.has(n)) return "reveals";
  if (PARTICLE_SET.has(n)) return "particles";
  return "kinetic";
}

export function isSpecialPreset(p?: TextPreset): boolean {
  return SPECIAL.has(normalizeIn(p));
}

export function easeOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}
export function easeOutBack(t: number) {
  const x = Math.min(1, Math.max(0, t));
  const c = 1.70158;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}

function covers(c: Clip, t: number) {
  return t >= c.start - 1e-4 && t < c.start + c.duration - 1e-6;
}

function localT(c: Clip, t: number) {
  return t - c.start;
}

export function kinetic(c: Clip, t: number): Kinetic {
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
  } else if (preset === "type" || preset === "typewriter") {
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
  } else if (preset === "scramble") {
    scramble = easeOutCubic(inP);
    opacity = 1;
  } else if (preset === "morph") {
    opacity = easeOutCubic(inP);
    scale = 0.35 + easeOutBack(inP) * 0.65;
  } else if (preset === "weight") {
    opacity = easeOutCubic(Math.min(1, inP * 1.35));
    weight = 200 + easeOutCubic(inP) * 500;
  } else if (preset === "pixel" || preset === "mask" || preset === "brush") {
    reveal = easeOutCubic(inP);
    opacity = 1;
  } else if (preset === "dust" || preset === "spark" || preset === "vapor") {
    opacity = easeOutCubic(inP);
    reveal = easeOutCubic(inP);
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

function wrapText(ctx: DrawCtx, text: string, maxW: number, maxLines = 6): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function faceFont(c: Clip, size: number, weight = 600) {
  const face = c.textFace === "sora" ? "Sora, system-ui, sans-serif" : "Fraunces, Georgia, serif";
  return `${Math.round(weight)} ${size}px ${face}`;
}

type Glyph = { ch: string; x: number; y: number; w: number; i: number };

function layoutGlyphs(ctx: DrawCtx, text: string, maxW: number, fontSize: number): Glyph[] {
  const lines = wrapText(ctx, text, maxW, 4);
  const lh = fontSize * 1.12;
  const top = -((lines.length - 1) * lh) / 2;
  const out: Glyph[] = [];
  let i = 0;
  lines.forEach((ln, li) => {
    const total = ctx.measureText(ln).width;
    let x = -total / 2;
    for (const ch of ln) {
      const w = ctx.measureText(ch).width;
      out.push({ ch, x: x + w / 2, y: top + li * lh, w, i });
      x += w;
      i++;
    }
  });
  return out;
}

const SCRAMBLE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789#%+";

function scrambleChar(ch: string, i: number, settle: number) {
  if (ch === " " || settle >= 0.999) return ch;
  const local = Math.min(1, Math.max(0, (settle - i * 0.055) / 0.42));
  if (local >= 1) return ch;
  const idx = Math.abs(Math.floor(i * 13 + (1 - local) * 19 + settle * 47)) % SCRAMBLE.length;
  return SCRAMBLE[idx];
}

function hash2(i: number, j: number) {
  let x = (i * 374761393 + j * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;
function getScratch(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: DrawCtx } | null {
  const cw = Math.max(2, Math.ceil(w));
  const ch = Math.max(2, Math.ceil(h));
  if (typeof OffscreenCanvas !== "undefined") {
    if (!scratch || scratch.width !== cw || scratch.height !== ch) scratch = new OffscreenCanvas(cw, ch);
  } else if (typeof document !== "undefined") {
    if (!scratch || scratch.width !== cw || scratch.height !== ch) {
      const el = document.createElement("canvas");
      el.width = cw;
      el.height = ch;
      scratch = el;
    }
  } else return null;
  const ctx = scratch.getContext("2d");
  if (!ctx) return null;
  return { canvas: scratch, ctx: ctx as DrawCtx };
}

function fillClassic(ctx: DrawCtx, c: Clip, k: Kinetic, w: number, shown: string) {
  ctx.fillStyle = c.color;
  ctx.textBaseline = "middle";
  ctx.font = faceFont(c, c.fontSize, 600);
  ctx.shadowColor = "rgba(13,15,20,0.55)";
  ctx.shadowBlur = 18;
  const preset = normalizeIn(c.inPreset || c.preset);
  if (preset === "split" && k.split > 0.2) {
    ctx.textAlign = "left";
    const mid = Math.max(1, Math.ceil(shown.length / 2));
    const left = shown.slice(0, mid);
    const right = shown.slice(mid);
    const totalW = ctx.measureText(shown).width;
    const leftW = ctx.measureText(left).width;
    const x0 = -totalW / 2;
    ctx.fillText(left, x0 - k.split, 0);
    ctx.fillText(right, x0 + leftW + k.split, 0);
  } else {
    ctx.textAlign = "center";
    const lines = wrapText(ctx, shown, w * 0.86, 4);
    const lh = c.fontSize * 1.12;
    const top = -((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, 0, top + i * lh));
  }
}

function drawParticles(
  ctx: DrawCtx,
  glyphs: Glyph[],
  preset: TextPreset,
  reveal: number,
  color: string,
  fontSize: number,
) {
  const n = 18;
  ctx.save();
  ctx.shadowBlur = 0;
  for (let i = 0; i < n; i++) {
    const g = glyphs[i % Math.max(1, glyphs.length)] || { x: 0, y: 0, w: 8, ch: " ", i: 0 };
    const u = hash2(i, 3);
    const v = hash2(i, 7);
    const size = 1.6 + u * 2.4;
    let x = g.x;
    let y = g.y;
    let a = 0.55;
    if (preset === "dust") {
      const fromX = g.x + (u - 0.5) * fontSize * 2.4;
      const fromY = g.y + (v - 0.5) * fontSize * 1.8;
      const p = easeOutCubic(Math.min(1, Math.max(0, reveal * 1.15 - u * 0.2)));
      x = fromX + (g.x - fromX) * p;
      y = fromY + (g.y - fromY) * p;
      a = 0.25 + 0.55 * (1 - p) + 0.12 * p;
      if (p > 0.92) a *= 1 - (p - 0.92) / 0.08;
    } else if (preset === "vapor") {
      const p = easeOutCubic(Math.min(1, Math.max(0, reveal * 1.1 - u * 0.15)));
      x = g.x + (u - 0.5) * fontSize * 0.35;
      y = g.y - p * fontSize * (0.9 + v);
      a = (1 - p) * 0.55;
    } else {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(reveal * 6.2 + u * 12));
      x = g.x + (u - 0.5) * g.w * 1.6;
      y = g.y - fontSize * 0.42 + (v - 0.5) * fontSize * 0.5;
      a = 0.18 + tw * 0.55;
      if (reveal < 0.12) a *= reveal / 0.12;
    }
    if (a <= 0.02) continue;
    ctx.globalAlpha *= a;
    ctx.fillStyle = i % 3 === 0 ? "#D9CCAC" : color;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha /= a;
  }
  ctx.restore();
}

function drawSpecial(ctx: DrawCtx, c: Clip, t: number, w: number, k: Kinetic) {
  const preset = normalizeIn(c.inPreset || c.preset);
  ctx.fillStyle = c.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = faceFont(c, c.fontSize, preset === "weight" ? k.weight : 600);
  ctx.shadowColor = "rgba(13,15,20,0.55)";
  ctx.shadowBlur = preset === "pixel" ? 0 : 16;
  const glyphs = layoutGlyphs(ctx, c.text, w * 0.86, c.fontSize);
  const lt = Math.max(0, t - c.start);

  if (preset === "scramble") {
    for (const g of glyphs) {
      const ch = scrambleChar(g.ch, g.i, k.scramble);
      ctx.fillText(ch, g.x, g.y);
    }
    return;
  }

  if (preset === "morph") {
    for (const g of glyphs) {
      const local = easeOutBack(Math.min(1, Math.max(0, k.inP * 1.15 - g.i * 0.06)));
      const sy = 0.18 + local * 0.82;
      const sx = 1.35 - local * 0.35;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.scale(sx * k.scale, sy * k.scale);
      ctx.globalAlpha *= Math.min(1, local * 1.2);
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
    return;
  }

  if (preset === "weight") {
    for (const g of glyphs) {
      const local = easeOutCubic(Math.min(1, Math.max(0, (k.weight - 200) / 500 - g.i * 0.05)));
      const wt = 200 + local * 500;
      ctx.font = faceFont(c, c.fontSize, wt);
      ctx.fillText(g.ch, g.x, g.y);
    }
    ctx.font = faceFont(c, c.fontSize, 600);
    return;
  }

  if (preset === "typewriter") {
    const shown = glyphs.filter((g) => g.i < k.chars);
    for (const g of shown) ctx.fillText(g.ch, g.x, g.y);
    const blink = Math.floor(lt * 2.4) % 2 === 0;
    if (blink && k.chars < c.text.length) {
      const last = shown[shown.length - 1];
      const x = last ? last.x + last.w * 0.7 : 0;
      const y = last ? last.y : 0;
      ctx.fillStyle = "#D9CCAC";
      ctx.fillRect(x, y - c.fontSize * 0.42, Math.max(3, c.fontSize * 0.06), c.fontSize * 0.84);
    }
    return;
  }

  if (preset === "mask" || preset === "brush") {
    const bounds = glyphBounds(glyphs, c.fontSize);
    const reveal = k.reveal;
    ctx.save();
    ctx.beginPath();
    if (preset === "mask") {
      ctx.rect(bounds.x, bounds.y, bounds.w * reveal, bounds.h);
    } else {
      const lead = bounds.x + bounds.w * reveal;
      ctx.moveTo(bounds.x - 4, bounds.y - 4);
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const yy = bounds.y - 4 + (bounds.h + 8) * (i / steps);
        const wob = Math.sin(i * 0.9 + reveal * 5) * c.fontSize * 0.12;
        ctx.lineTo(lead + wob, yy);
      }
      ctx.lineTo(bounds.x - 4, bounds.y + bounds.h + 4);
      ctx.closePath();
    }
    ctx.clip();
    for (const g of glyphs) ctx.fillText(g.ch, g.x, g.y);
    ctx.restore();
    return;
  }

  if (preset === "pixel") {
    const bounds = glyphBounds(glyphs, c.fontSize);
    const pad = 8;
    const sw = Math.max(8, Math.ceil(bounds.w + pad * 2));
    const sh = Math.max(8, Math.ceil(bounds.h + pad * 2));
    const sc = getScratch(sw, sh);
    if (!sc) {
      ctx.globalAlpha *= k.reveal;
      for (const g of glyphs) ctx.fillText(g.ch, g.x, g.y);
      return;
    }
    sc.ctx.setTransform(1, 0, 0, 1, 0, 0);
    sc.ctx.clearRect(0, 0, sw, sh);
    sc.ctx.fillStyle = c.color;
    sc.ctx.textAlign = "center";
    sc.ctx.textBaseline = "middle";
    sc.ctx.font = faceFont(c, c.fontSize, 600);
    const ox = -bounds.x + pad;
    const oy = -bounds.y + pad;
    for (const g of glyphs) sc.ctx.fillText(g.ch, g.x + ox, g.y + oy);
    const cell = Math.max(4, Math.round(c.fontSize / 9));
    const cols = Math.ceil(sw / cell);
    const rows = Math.ceil(sh / cell);
    ctx.shadowBlur = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (hash2(i, j) > k.reveal * 1.08) continue;
        const sx = i * cell;
        const sy = j * cell;
        ctx.drawImage(sc.canvas as CanvasImageSource, sx, sy, cell, cell, bounds.x - pad + sx, bounds.y - pad + sy, cell, cell);
      }
    }
    return;
  }

  if (preset === "dust" || preset === "spark" || preset === "vapor") {
    for (const g of glyphs) ctx.fillText(g.ch, g.x, g.y);
    drawParticles(ctx, glyphs, preset, k.reveal, c.color, c.fontSize);
    return;
  }

  if (preset === "fadeup") {
    ctx.textAlign = "center";
    const lines = wrapText(ctx, c.text, w * 0.86, 4);
    const lh = c.fontSize * 1.12;
    const top = -((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, 0, top + i * lh));
  }
}

function glyphBounds(glyphs: Glyph[], fontSize: number) {
  if (!glyphs.length) return { x: -40, y: -20, w: 80, h: 40 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of glyphs) {
    minX = Math.min(minX, g.x - g.w / 2);
    maxX = Math.max(maxX, g.x + g.w / 2);
    minY = Math.min(minY, g.y - fontSize * 0.55);
    maxY = Math.max(maxY, g.y + fontSize * 0.55);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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
    drawSpecial(ctx, c, t, w, k);
  } else {
    const shown = preset === "type" ? c.text.slice(0, k.chars) : c.text;
    if (shown) fillClassic(ctx, c, k, w, shown);
  }
  ctx.restore();
}
