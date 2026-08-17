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

export function easeOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}
export function easeOutBack(t: number) {
  const x = Math.min(1, Math.max(0, t));
  const c = 1.70158;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}
export function easeOutElastic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

let reduceOverride: boolean | null = null;
export function setReduceOverride(v: boolean | null) {
  reduceOverride = v;
}
export function prefersReduce(): boolean {
  if (reduceOverride != null) return reduceOverride;
  try {
    return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function wrapText(ctx: DrawCtx, text: string, maxW: number, maxLines = 6): string[] {
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

export function faceFont(c: Clip, size: number, weight = 600) {
  const face = c.textFace === "sora" ? "Sora, system-ui, sans-serif" : "Fraunces, Georgia, serif";
  return `${Math.round(weight)} ${size}px ${face}`;
}

export type Glyph = { ch: string; x: number; y: number; w: number; i: number };

export function layoutGlyphs(ctx: DrawCtx, text: string, maxW: number, fontSize: number): Glyph[] {
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

export const SCRAMBLE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789#%+";

export function scrambleChar(ch: string, i: number, settle: number) {
  if (ch === " " || settle >= 0.999) return ch;
  const local = Math.min(1, Math.max(0, (settle - i * 0.055) / 0.42));
  if (local >= 1) return ch;
  const idx = Math.abs(Math.floor(i * 13 + (1 - local) * 19 + settle * 47)) % SCRAMBLE.length;
  return SCRAMBLE[idx];
}

export function hash2(i: number, j: number) {
  let x = (i * 374761393 + j * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;
export function getScratch(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: DrawCtx } | null {
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

export function glyphBounds(glyphs: Glyph[], fontSize: number) {
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

function rr(ctx: DrawCtx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof (ctx as CanvasRenderingContext2D).roundRect === "function") {
    (ctx as CanvasRenderingContext2D).roundRect(x, y, w, h, rad);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function fillGlyphs(ctx: DrawCtx, glyphs: Glyph[]) {
  for (const g of glyphs) ctx.fillText(g.ch, g.x, g.y);
}

function paintScratch(c: Clip, glyphs: Glyph[], bounds: { x: number; y: number; w: number; h: number }, pad = 8) {
  const sw = Math.max(8, Math.ceil(bounds.w + pad * 2));
  const sh = Math.max(8, Math.ceil(bounds.h + pad * 2));
  const sc = getScratch(sw, sh);
  if (!sc) return null;
  sc.ctx.setTransform(1, 0, 0, 1, 0, 0);
  sc.ctx.clearRect(0, 0, sw, sh);
  sc.ctx.fillStyle = c.color;
  sc.ctx.textAlign = "center";
  sc.ctx.textBaseline = "middle";
  sc.ctx.font = faceFont(c, c.fontSize, 600);
  const ox = -bounds.x + pad;
  const oy = -bounds.y + pad;
  for (const g of glyphs) sc.ctx.fillText(g.ch, g.x + ox, g.y + oy);
  return { sc, sw, sh, pad, ox, oy };
}

export function fillClassic(ctx: DrawCtx, c: Clip, k: Kinetic, w: number, shown: string) {
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

export function drawParticles(
  ctx: DrawCtx,
  glyphs: Glyph[],
  preset: TextPreset,
  reveal: number,
  color: string,
  fontSize: number,
  lt = 0,
) {
  const n = preset === "tunnel" ? 24 : 18;
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
    let tw = size;
    let th = size;
    if (preset === "dust") {
      const fromX = g.x + (u - 0.5) * fontSize * 2.4;
      const fromY = g.y + (v - 0.5) * fontSize * 1.8;
      const p = easeOutCubic(Math.min(1, Math.max(0, reveal * 1.15 - u * 0.2)));
      x = fromX + (g.x - fromX) * p;
      y = fromY + (g.y - fromY) * p;
      a = 0.25 + 0.55 * (1 - p) + 0.12 * p;
      if (p > 0.92) a *= 1 - (p - 0.92) / 0.08;
    } else if (preset === "vapor" || preset === "vaporize") {
      const p = easeOutCubic(Math.min(1, Math.max(0, reveal * 1.1 - u * 0.15)));
      x = g.x + (u - 0.5) * fontSize * 0.35;
      y = g.y - p * fontSize * (0.9 + v);
      a = (1 - p) * 0.55 + 0.08;
    } else if (preset === "starburst") {
      const ang = (i / n) * Math.PI * 2 + reveal * 0.5;
      const rad = fontSize * (0.25 + reveal * (0.9 + u * 0.4));
      x = Math.cos(ang) * rad;
      y = Math.sin(ang) * rad;
      tw = 2.2 + u * 3;
      th = 2.2;
      a = 0.25 + (1 - Math.abs(reveal - 0.55)) * 0.55;
    } else if (preset === "glitter") {
      const twk = 0.35 + 0.65 * Math.abs(Math.sin(lt * 9 + u * 14));
      x = g.x + (u - 0.5) * fontSize * 1.8;
      y = g.y + (v - 0.5) * fontSize * 1.2;
      a = 0.15 + twk * 0.7;
      tw = 1.4 + twk * 2.2;
      th = tw;
    } else if (preset === "tunnel") {
      const ring = i % 6;
      const side = Math.floor(i / 6);
      const p = ((reveal * 1.4 + ring / 6 + lt * 0.15) % 1);
      const s = fontSize * (0.35 + p * 1.8);
      const half = s / 2;
      if (side === 0) {
        x = 0;
        y = -half;
        tw = s;
        th = 2;
      } else if (side === 1) {
        x = 0;
        y = half;
        tw = s;
        th = 2;
      } else if (side === 2) {
        x = -half;
        y = 0;
        tw = 2;
        th = s;
      } else {
        x = half;
        y = 0;
        tw = 2;
        th = s;
      }
      a = (1 - p) * 0.55;
    } else if (preset === "stardust") {
      x = (u - 0.5) * fontSize * 3.2;
      y = ((v + lt * (0.18 + u * 0.12)) % 1) * fontSize * 2.4 - fontSize * 1.2;
      a = 0.22 + v * 0.4;
      tw = 1.4 + u;
      th = tw;
    } else if (preset === "snow") {
      x = (u - 0.5) * fontSize * 3.4 + Math.sin(lt * 2 + i) * fontSize * 0.12;
      y = ((v + lt * (0.22 + u * 0.1)) % 1) * fontSize * 2.6 - fontSize * 1.3;
      a = 0.35 + v * 0.4;
      tw = 2 + u * 2;
      th = tw;
    } else {
      const spark = 0.35 + 0.65 * Math.abs(Math.sin(reveal * 6.2 + u * 12));
      x = g.x + (u - 0.5) * g.w * 1.6;
      y = g.y - fontSize * 0.42 + (v - 0.5) * fontSize * 0.5;
      a = 0.18 + spark * 0.55;
      if (reveal < 0.12) a *= reveal / 0.12;
    }
    if (a <= 0.02) continue;
    ctx.globalAlpha *= a;
    ctx.fillStyle = i % 3 === 0 ? "#D9CCAC" : color;
    ctx.fillRect(x - tw / 2, y - th / 2, tw, th);
    ctx.globalAlpha /= a;
  }
  ctx.restore();
}

function drawEmojiBits(ctx: DrawCtx, glyphs: Glyph[], reveal: number, fontSize: number, lt: number) {
  const marks = ["✦", "★", "✧", "·"];
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(fontSize * 0.28)}px Sora, system-ui, sans-serif`;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const u = hash2(i, 11);
    const v = hash2(i, 19);
    const ang = (i / n) * Math.PI * 2 + lt * 0.7;
    const rad = fontSize * (0.55 + u * 0.9) * (0.4 + reveal);
    const a = 0.35 + 0.45 * Math.abs(Math.sin(lt * 4 + i));
    ctx.globalAlpha *= a;
    ctx.fillStyle = i % 2 === 0 ? "#D9CCAC" : "#F0EFEC";
    ctx.fillText(marks[i % marks.length], Math.cos(ang) * rad, Math.sin(ang) * rad + (v - 0.5) * 6);
    ctx.globalAlpha /= a;
  }
  ctx.restore();
}

function localOf(g: Glyph, inP: number, stagger = 0.055) {
  return easeOutCubic(Math.min(1, Math.max(0, inP * 1.2 - g.i * stagger)));
}

export function drawOverlayFx(ctx: DrawCtx, c: Clip, t: number, w: number, k: Kinetic) {
  const preset = normalizeIn(c.inPreset || c.preset);
  const lt = Math.max(0, t - c.start);
  ctx.fillStyle = c.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = faceFont(c, c.fontSize, preset === "weight" ? k.weight : 600);
  ctx.shadowColor = "rgba(13,15,20,0.55)";
  ctx.shadowBlur = preset === "pixel" || preset === "dither" ? 0 : 16;
  const glyphs = layoutGlyphs(ctx, c.text, w * 0.86, c.fontSize);
  const reduced = prefersReduce();

  if (preset === "scramble" || preset === "letterswap") {
    for (const g of glyphs) {
      let ch = scrambleChar(g.ch, g.i, k.scramble);
      if (preset === "letterswap" && k.scramble < 0.92 && g.i + 1 < glyphs.length && hash2(g.i, 4) > 0.55) {
        ch = glyphs[g.i + 1].ch;
      }
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

  if (preset === "typewriter" || preset === "typesequence") {
    if (preset === "typesequence") {
      const words = c.text.split(/\s+/);
      const typeDur = Math.max(c.inDur ?? 0.45, words.length * 0.16);
      const n = reduced ? words.length : Math.max(0, Math.floor(words.length * Math.min(1, lt / typeDur)));
      const shown = words.slice(0, Math.max(1, n)).join(" ");
      const lines = wrapText(ctx, shown, w * 0.86, 4);
      const lh = c.fontSize * 1.12;
      const top = -((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) => ctx.fillText(ln, 0, top + i * lh));
    } else {
      const shown = glyphs.filter((g) => g.i < k.chars);
      for (const g of shown) ctx.fillText(g.ch, g.x, g.y);
      const blink = Math.floor(lt * 2.4) % 2 === 0;
      if (blink && k.chars < c.text.length && !reduced) {
        const last = shown[shown.length - 1];
        const x = last ? last.x + last.w * 0.7 : 0;
        const y = last ? last.y : 0;
        ctx.fillStyle = "#D9CCAC";
        ctx.fillRect(x, y - c.fontSize * 0.42, Math.max(3, c.fontSize * 0.06), c.fontSize * 0.84);
      }
    }
    return;
  }

  if (preset === "mask" || preset === "brush" || preset === "textwipe" || preset === "emerge") {
    const bounds = glyphBounds(glyphs, c.fontSize);
    const reveal = k.reveal;
    ctx.save();
    ctx.beginPath();
    if (preset === "mask") {
      ctx.rect(bounds.x, bounds.y, bounds.w * reveal, bounds.h);
    } else if (preset === "textwipe") {
      ctx.rect(bounds.x - 8, bounds.y - 8, (bounds.w + 16) * reveal, bounds.h + 16);
    } else if (preset === "emerge") {
      const h = bounds.h * reveal;
      ctx.rect(bounds.x - 6, bounds.y + bounds.h - h, bounds.w + 12, h + 4);
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
    fillGlyphs(ctx, glyphs);
    ctx.restore();
    return;
  }

  if (preset === "pixel" || preset === "dither" || preset === "pixelunfold") {
    const bounds = glyphBounds(glyphs, c.fontSize);
    const packed = paintScratch(c, glyphs, bounds, 8);
    if (!packed) {
      ctx.globalAlpha *= k.reveal;
      fillGlyphs(ctx, glyphs);
      return;
    }
    const { sc, sw, sh, pad } = packed;
    const cell = Math.max(4, Math.round(c.fontSize / 9));
    const cols = Math.ceil(sw / cell);
    const rows = Math.ceil(sh / cell);
    ctx.shadowBlur = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const thresh = preset === "dither" ? ((i * 3 + j * 7) % 16) / 16 : hash2(i, j);
        if (thresh > k.reveal * 1.08) continue;
        let dw = cell;
        let dh = cell;
        if (preset === "pixelunfold") {
          const grow = easeOutBack(Math.min(1, Math.max(0, k.reveal * 1.2 - thresh * 0.4)));
          dw = cell * grow;
          dh = cell * grow;
        }
        const sx = i * cell;
        const sy = j * cell;
        ctx.drawImage(
          sc.canvas as CanvasImageSource,
          sx,
          sy,
          cell,
          cell,
          bounds.x - pad + sx + (cell - dw) / 2,
          bounds.y - pad + sy + (cell - dh) / 2,
          dw,
          dh,
        );
      }
    }
    return;
  }

  if (preset === "dust" || preset === "spark" || preset === "vapor") {
    fillGlyphs(ctx, glyphs);
    drawParticles(ctx, glyphs, preset, k.reveal, c.color, c.fontSize, lt);
    return;
  }

  if (preset === "starburst" || preset === "glitter" || preset === "tunnel" || preset === "stardust" || preset === "snow") {
    fillGlyphs(ctx, glyphs);
    drawParticles(ctx, glyphs, preset, k.reveal, c.color, c.fontSize, lt);
    return;
  }

  if (preset === "emoji") {
    fillGlyphs(ctx, glyphs);
    drawEmojiBits(ctx, glyphs, k.reveal, c.fontSize, lt);
    return;
  }

  if (preset === "vaporize") {
    for (const g of glyphs) {
      const p = localOf(g, k.reveal, 0.04);
      ctx.save();
      ctx.globalAlpha *= Math.max(0.15, 1 - p * 0.35);
      ctx.translate(g.x, g.y - p * c.fontSize * 0.35);
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
    drawParticles(ctx, glyphs, "vaporize", k.reveal, c.color, c.fontSize, lt);
    return;
  }

  if (preset === "glitchtext" || preset === "glitch") {
    const jitter = reduced ? 0 : (1 - k.inP) * 10 + Math.sin(lt * 28) * 2.2;
    ctx.save();
    ctx.globalAlpha *= 0.7;
    ctx.fillStyle = "#c45c4a";
    for (const g of glyphs) ctx.fillText(g.ch, g.x - 3 - jitter * 0.3, g.y);
    ctx.fillStyle = "#8C9297";
    for (const g of glyphs) ctx.fillText(g.ch, g.x + 3 + jitter * 0.2, g.y);
    ctx.restore();
    ctx.fillStyle = c.color;
    fillGlyphs(ctx, glyphs);
    if (!reduced) {
      ctx.save();
      ctx.shadowBlur = 0;
      const b = glyphBounds(glyphs, c.fontSize);
      for (let i = 0; i < 6; i++) {
        if (hash2(i, Math.floor(lt * 18)) > 0.5) continue;
        const yy = b.y + (b.h * i) / 6;
        const ox = (hash2(i, 21 + Math.floor(lt * 18)) - 0.5) * c.fontSize * 0.4;
        ctx.fillStyle = i % 2 === 0 ? "rgba(196,92,74,0.35)" : "rgba(217,204,172,0.28)";
        ctx.fillRect(b.x + ox, yy, b.w, Math.max(2, b.h / 10));
      }
      ctx.restore();
    }
    return;
  }

  if (preset === "smoky") {
    ctx.save();
    ctx.shadowColor = "rgba(217,204,172,0.55)";
    ctx.shadowBlur = 28;
    for (const g of glyphs) {
      const p = localOf(g, k.inP, 0.04);
      ctx.globalAlpha = 0.35 + p * 0.65;
      ctx.fillText(g.ch, g.x + Math.sin(lt * 2 + g.i) * 2, g.y - (1 - p) * 10);
    }
    ctx.restore();
    return;
  }

  if (preset === "spotlight") {
    const b = glyphBounds(glyphs, c.fontSize);
    const cx = b.x + b.w * (0.12 + 0.76 * k.reveal);
    const g = ctx.createRadialGradient(cx, 0, 2, cx, 0, Math.max(b.w, c.fontSize) * 0.72);
    g.addColorStop(0, "#F0EFEC");
    g.addColorStop(0.42, "#D9CCAC");
    g.addColorStop(1, "rgba(87,88,96,0.25)");
    ctx.fillStyle = g;
    fillGlyphs(ctx, glyphs);
    return;
  }

  if (preset === "textwave" || preset === "charwaves" || preset === "fluidtext") {
    for (const g of glyphs) {
      const amp = preset === "fluidtext" ? 0.22 : 0.18;
      const y =
        g.y +
        Math.sin(lt * (preset === "fluidtext" ? 5.2 : 6.4) + g.i * (preset === "charwaves" ? 0.9 : 0.55)) *
          c.fontSize *
          amp *
          (reduced ? 0 : 1);
      const sc = preset === "charwaves" ? 1 + Math.sin(lt * 5 + g.i) * 0.08 * (1 - k.inP * 0.4) : 1;
      ctx.save();
      ctx.translate(g.x, y);
      ctx.scale(1, sc);
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
    return;
  }

  if (preset === "flicker") {
    const frame = Math.floor(lt * 14);
    const on = reduced || hash2(frame, 3) > 0.22;
    ctx.globalAlpha *= on ? 1 : 0.38;
    fillGlyphs(ctx, glyphs);
    return;
  }

  if (preset === "spring" || preset === "staggerrise" || preset === "letterdrop" || preset === "falling" || preset === "appear" || preset === "elastic") {
    for (const g of glyphs) {
      const local =
        preset === "elastic"
          ? easeOutElastic(Math.min(1, Math.max(0, k.inP * 1.1 - g.i * 0.05)))
          : preset === "spring"
            ? easeOutBack(Math.min(1, Math.max(0, k.inP * 1.15 - g.i * 0.07)))
            : localOf(g, k.inP, preset === "staggerrise" ? 0.08 : 0.05);
      let y = g.y;
      let sx = 1;
      let sy = 1;
      if (preset === "letterdrop" || preset === "falling") y = g.y - (1 - local) * c.fontSize * (preset === "falling" ? 1.6 : 1.1);
      if (preset === "staggerrise" || preset === "spring") y = g.y + (1 - local) * c.fontSize * 0.7;
      if (preset === "appear") {
        sx = sy = 0.2 + local * 0.8;
      }
      if (preset === "elastic") {
        sx = 0.7 + local * 0.3;
        sy = 1.35 - local * 0.35;
      }
      ctx.save();
      ctx.translate(g.x, y);
      ctx.scale(sx, sy);
      ctx.globalAlpha *= Math.min(1, 0.2 + local * 1.1);
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
    return;
  }

  if (preset === "rolling" || preset === "flip" || preset === "unfold" || preset === "letterswing") {
    for (const g of glyphs) {
      const local = easeOutBack(Math.min(1, Math.max(0, k.inP * 1.2 - g.i * 0.06)));
      ctx.save();
      ctx.translate(g.x, g.y);
      if (preset === "letterswing") {
        ctx.rotate((1 - local) * 0.7 * (g.i % 2 === 0 ? -1 : 1));
      } else if (preset === "flip" || preset === "rolling") {
        const ang = (1 - local) * Math.PI;
        ctx.scale(Math.max(0.08, Math.abs(Math.cos(ang))), 1);
      } else {
        ctx.transform(1, 0, (1 - local) * 0.45, Math.max(0.08, local), 0, 0);
      }
      ctx.globalAlpha *= Math.min(1, 0.25 + local);
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
    return;
  }

  if (preset === "textnoise") {
    for (const g of glyphs) {
      const jx = reduced ? 0 : (hash2(g.i, Math.floor(lt * 24)) - 0.5) * 3.2;
      const jy = reduced ? 0 : (hash2(g.i, Math.floor(lt * 24) + 9) - 0.5) * 2.4;
      ctx.fillText(g.ch, g.x + jx, g.y + jy);
    }
    return;
  }

  if (preset === "spiral") {
    for (const g of glyphs) {
      const local = easeOutCubic(Math.min(1, Math.max(0, k.inP * 1.15 - g.i * 0.05)));
      const ang = (1 - local) * Math.PI * 2 + g.i * 0.45;
      const rad = (1 - local) * c.fontSize * 2.1;
      ctx.fillText(g.ch, g.x * local + Math.cos(ang) * rad, g.y * local + Math.sin(ang) * rad);
    }
    return;
  }

  if (preset === "coloursweep" || preset === "gradient") {
    const b = glyphBounds(glyphs, c.fontSize);
    const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
    const p = preset === "gradient" ? (0.25 + (lt * 0.15) % 0.5) : k.reveal;
    g.addColorStop(0, "#F0EFEC");
    g.addColorStop(Math.max(0.02, Math.min(0.98, p)), "#D9CCAC");
    g.addColorStop(1, "#8C9297");
    ctx.fillStyle = g;
    fillGlyphs(ctx, glyphs);
    return;
  }

  if (preset === "focus") {
    ctx.save();
    ctx.shadowBlur = 0;
    const blur = (1 - k.reveal) * 10;
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.18;
      ctx.fillText(c.text, (hash2(i, 1) - 0.5) * blur, (hash2(i, 2) - 0.5) * blur);
    }
    ctx.restore();
    ctx.globalAlpha *= 0.35 + k.reveal * 0.65;
    fillGlyphs(ctx, glyphs);
    return;
  }

  if (preset === "imagefold") {
    const b = glyphBounds(glyphs, c.fontSize);
    const packed = paintScratch(c, glyphs, b, 6);
    if (!packed) {
      fillGlyphs(ctx, glyphs);
      return;
    }
    const { sc, sw, sh, pad } = packed;
    const fold = easeOutCubic(k.reveal);
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.translate(0, 0);
    ctx.drawImage(sc.canvas as CanvasImageSource, 0, 0, sw / 2, sh, b.x - pad, b.y - pad, (sw / 2) * Math.max(0.12, fold), sh);
    ctx.drawImage(
      sc.canvas as CanvasImageSource,
      sw / 2,
      0,
      sw / 2,
      sh,
      b.x - pad + sw / 2 - ((1 - fold) * sw) / 4,
      b.y - pad,
      (sw / 2) * Math.max(0.12, fold),
      sh,
    );
    ctx.restore();
    return;
  }

  if (preset === "fluidimage" || preset === "imageripple" || preset === "distort") {
    const b = glyphBounds(glyphs, c.fontSize);
    const packed = paintScratch(c, glyphs, b, 10);
    if (!packed) {
      fillGlyphs(ctx, glyphs);
      return;
    }
    const { sc, sw, sh, pad } = packed;
    ctx.shadowBlur = 0;
    const rows = 16;
    const rh = sh / rows;
    for (let i = 0; i < rows; i++) {
      const wave =
        reduced || preset === "imageripple"
          ? Math.sin((i / rows) * Math.PI * 4 + k.reveal * 6) * (1 - k.reveal) * 12
          : Math.sin(lt * 7 + i * 0.55) * (8 + (1 - k.inP) * 10);
      const sy = i * rh;
      ctx.drawImage(sc.canvas as CanvasImageSource, 0, sy, sw, rh, b.x - pad + wave, b.y - pad + sy, sw, rh);
    }
    return;
  }

  if (preset === "ascii") {
    for (const g of glyphs) {
      const local = localOf(g, k.reveal, 0.05);
      const ch = local > 0.72 ? g.ch : SCRAMBLE[Math.floor(hash2(g.i, Math.floor(lt * 8)) * SCRAMBLE.length)];
      ctx.globalAlpha = 0.4 + local * 0.6;
      ctx.fillText(ch, g.x, g.y);
      ctx.globalAlpha = 1;
    }
    return;
  }

  if (preset === "shine") {
    fillGlyphs(ctx, glyphs);
    const b = glyphBounds(glyphs, c.fontSize);
    ctx.save();
    ctx.shadowBlur = 0;
    const x = b.x + ((lt * 0.55) % 1.2) * b.w * 1.1;
    ctx.beginPath();
    ctx.rect(x - 18, b.y - 8, 28, b.h + 16);
    ctx.clip();
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = "#F0EFEC";
    fillGlyphs(ctx, glyphs);
    ctx.restore();
    return;
  }

  if (preset === "inkbleed") {
    const b = glyphBounds(glyphs, c.fontSize);
    ctx.save();
    ctx.shadowBlur = 0;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const u = hash2(i, 2);
      const v = hash2(i, 5);
      const p = easeOutCubic(Math.min(1, k.reveal * 1.2 - u * 0.2));
      const rw = (12 + u * 28) * p;
      const rh = (8 + v * 18) * p;
      ctx.globalAlpha = 0.16 + (1 - p) * 0.2;
      ctx.fillStyle = i % 2 === 0 ? "#D9CCAC" : c.color;
      ctx.fillRect(b.x + u * b.w - rw / 2, b.y + v * b.h - rh / 2, rw, rh);
    }
    ctx.restore();
    ctx.globalAlpha *= 0.55 + k.reveal * 0.45;
    fillGlyphs(ctx, glyphs);
    return;
  }

  if (preset === "imagestack") {
    const cards = [
      { fill: "#575860", rot: -10, ox: -18 },
      { fill: "#8C9297", rot: 7, ox: 16 },
      { fill: "#D9CCAC", rot: 0, ox: 0 },
    ];
    const phase = reduced ? 2 : Math.floor((lt / 0.85) % 3);
    const cw = Math.max(160, c.fontSize * 3.1);
    const ch = Math.max(90, c.fontSize * 1.55);
    cards.forEach((card, i) => {
      const front = i === phase || (reduced && i === 2);
      ctx.save();
      ctx.rotate(((front ? 0 : card.rot) * Math.PI) / 180);
      ctx.translate(card.ox, front ? 0 : i * 4 - 6);
      ctx.globalAlpha *= front ? 1 : 0.72;
      ctx.fillStyle = card.fill;
      rr(ctx, -cw / 2, -ch / 2, cw, ch, 14);
      ctx.fill();
      if (front) {
        ctx.fillStyle = "#0D0F14";
        ctx.font = faceFont(c, Math.max(22, c.fontSize * 0.42), 600);
        ctx.fillText(c.text.slice(0, 18), 0, 0);
      }
      ctx.restore();
    });
    return;
  }

  if (preset === "neon" || preset === "pill") {
    ctx.font = faceFont(c, c.fontSize, 600);
    const tw = Math.max(ctx.measureText(c.text).width, 80);
    const pw = tw + c.fontSize * 0.9;
    const ph = c.fontSize * 1.35;
    ctx.save();
    ctx.shadowBlur = 0;
    if (preset === "neon") {
      ctx.shadowColor = "#D9CCAC";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "#D9CCAC";
      ctx.lineWidth = Math.max(2, c.fontSize * 0.04);
      rr(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(13,15,20,0.55)";
      rr(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = "#F0EFEC";
      ctx.fillText(c.text, 0, 0);
    } else {
      const g = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
      g.addColorStop(0, "#D9CCAC");
      g.addColorStop(1, "#F0EFEC");
      ctx.fillStyle = g;
      rr(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
      ctx.fill();
      const shineX = -pw / 2 + ((lt * 0.6) % 1.2) * pw;
      ctx.fillStyle = "rgba(240,239,236,0.45)";
      ctx.fillRect(shineX, -ph / 2, 22, ph);
      ctx.fillStyle = "#0D0F14";
      ctx.fillText(c.text, 0, 0);
    }
    ctx.restore();
    return;
  }

  fillGlyphs(ctx, glyphs);
}
