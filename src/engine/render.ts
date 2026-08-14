import {
  ASPECT_SIZE,
  type Clip,
  type Project,
  type TextPreset,
  clipEnd,
  normalizeIn,
  projectDuration,
} from "../types";

export type DrawCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type FrameBank = {
  frames: Map<string, CanvasImageSource>;
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

function covers(c: Clip, t: number) {
  return t >= c.start - 1e-4 && t < clipEnd(c) - 1e-6;
}

function localT(c: Clip, t: number) {
  return t - c.start;
}

function transDur(c: Clip, fps: number) {
  if (c.transitionIn === "cut") return 0;
  return (c.transitionFrames || 8) / fps;
}

function opacityAt(c: Clip, t: number, fps: number) {
  if (!covers(c, t)) return 0;
  const lt = localT(c, t);
  const td = transDur(c, fps);
  let o = 1;
  if (c.transitionIn !== "cut" && td > 0) o *= Math.min(1, lt / td);
  if (c.fadeIn > 0) o *= Math.min(1, lt / c.fadeIn);
  if (c.fadeOut > 0) o *= Math.min(1, (c.duration - lt) / c.fadeOut);
  return Math.max(0, Math.min(1, o));
}

function trackClips(p: Project, trackId: string) {
  return p.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
}

function prevOnTrack(p: Project, clip: Clip): Clip | undefined {
  const list = trackClips(p, clip.trackId);
  const i = list.findIndex((c) => c.id === clip.id);
  return i > 0 ? list[i - 1] : undefined;
}

function drawImageCover(
  ctx: DrawCtx,
  img: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const iw =
    (img as HTMLVideoElement).videoWidth ||
    (img as HTMLImageElement).naturalWidth ||
    (img as HTMLCanvasElement).width ||
    dw;
  const ih =
    (img as HTMLVideoElement).videoHeight ||
    (img as HTMLImageElement).naturalHeight ||
    (img as HTMLCanvasElement).height ||
    dh;
  if (!iw || !ih) return;
  const s = Math.max(dw / iw, dh / ih);
  const sw = dw / s;
  const sh = dh / s;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, dx, dy, dw, dh);
}

function starPath(ctx: DrawCtx, cx: number, cy: number, r: number, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export type Kinetic = {
  opacity: number;
  ty: number;
  tx: number;
  scale: number;
  chars: number;
  split: number;
};

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

  if (preset === "fade") {
    opacity = easeOutCubic(inP);
  } else if (preset === "rise") {
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
  } else {
    /* hold — hard cut in */
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
  /* hold out: no change */

  return { opacity, ty, tx, scale, chars, split };
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
  return `${weight} ${size}px ${face}`;
}

export function drawTextClip(ctx: DrawCtx, c: Clip, t: number, w: number, h: number) {
  if (!covers(c, t) || !c.text) return;
  const k = kinetic(c, t);
  const preset = normalizeIn(c.inPreset || c.preset);
  const shown = preset === "type" ? c.text.slice(0, k.chars) : c.text;
  if (!shown) return;
  ctx.save();
  ctx.globalAlpha *= k.opacity;
  const cx = c.x * w + k.tx;
  const cy = c.y * h + k.ty;
  ctx.translate(cx, cy);
  ctx.scale(k.scale * c.scale, k.scale * c.scale);
  ctx.fillStyle = c.color;
  ctx.textBaseline = "middle";
  ctx.font = faceFont(c, c.fontSize, 600);
  ctx.shadowColor = "rgba(13,15,20,0.55)";
  ctx.shadowBlur = 18;

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
  ctx.restore();
}

function captionWords(c: Clip): { t: number; w: string }[] {
  if (c.captionWords?.length) return c.captionWords;
  const parts = c.text.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  return parts.map((w, i) => ({
    t: c.start + (i / parts.length) * c.duration,
    w,
  }));
}

function drawStrokedLine(
  ctx: DrawCtx,
  text: string,
  x: number,
  y: number,
  fill: string,
  strokeW: number,
) {
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = strokeW;
  ctx.strokeStyle = "#0D0F14";
  ctx.fillStyle = fill;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function drawCaption(ctx: DrawCtx, c: Clip, t: number, w: number, h: number, project: Project) {
  if (!covers(c, t) || !c.text) return;
  const lt = localT(c, t);
  const fade = Math.min(1, lt / 0.12, (c.duration - lt) / 0.12);
  const style = c.captionStyle || "stroke";
  ctx.save();
  ctx.globalAlpha *= Math.max(0, fade);
  const yNorm = c.y || 0.72;
  const maxBottom = h * 0.82;

  if (style === "stack") {
    const fs = Math.round((72 / 1080) * w);
    const prevFs = Math.round((40 / 1080) * w);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cy = Math.min(yNorm * h, maxBottom - fs);
    const prev = prevOnTrack(project, c);
    if (prev?.type === "caption" && prev.text) {
      ctx.font = `500 ${prevFs}px Sora, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(140,146,151,0.85)";
      const prevLines = wrapText(ctx, prev.text, w * 0.86, 1);
      ctx.fillText(prevLines[0] || prev.text, w / 2, cy - fs * 0.9);
    }
    ctx.font = `700 ${fs}px Sora, system-ui, sans-serif`;
    ctx.shadowColor = "rgba(13,15,20,0.45)";
    ctx.shadowBlur = 12;
    const lines = wrapText(ctx, c.text, w * 0.86, 2);
    const lh = fs * 1.18;
    lines.forEach((ln, i) => ctx.fillText(ln, w / 2, cy + i * lh));
    ctx.restore();
    return;
  }

  if (style === "karaoke") {
    const fs = Math.round((62 / 1080) * w);
    const strokeW = 6 * (w / 1080);
    ctx.font = `700 ${fs}px Sora, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(13,15,20,0.4)";
    ctx.shadowBlur = 8;
    const words = captionWords(c);
    const space = ctx.measureText(" ").width;
    const maxW = w * 0.86;
    type Row = { words: typeof words; width: number };
    const rows: Row[] = [];
    let row: typeof words = [];
    let rw = 0;
    for (const wd of words) {
      const ww = ctx.measureText(wd.w).width;
      const need = rw === 0 ? ww : rw + space + ww;
      if (need > maxW && row.length) {
        rows.push({ words: row, width: rw });
        row = [wd];
        rw = ww;
      } else {
        row.push(wd);
        rw = need;
      }
    }
    if (row.length) rows.push({ words: row, width: rw });
    const use = rows.slice(0, 2);
    const lh = fs * 1.28;
    const blockH = use.length * lh;
    let cy = yNorm * h - blockH / 2 + lh / 2;
    if (cy + blockH / 2 > maxBottom) cy = maxBottom - blockH / 2;
    const current = [...words].reverse().find((wd) => t >= wd.t - 1e-4);
    use.forEach((r, ri) => {
      let x = (w - r.width) / 2;
      r.words.forEach((wd) => {
        const fill = current && wd.t === current.t && wd.w === current.w ? "#D9CCAC" : "#F0EFEC";
        drawStrokedLine(ctx, wd.w, x, cy + ri * lh, fill, strokeW);
        x += ctx.measureText(wd.w).width + space;
      });
    });
    ctx.restore();
    return;
  }

  if (style === "stroke") {
    const fs = Math.round((62 / 1080) * w);
    const strokeW = 6 * (w / 1080);
    ctx.font = `700 ${fs}px Sora, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(13,15,20,0.45)";
    ctx.shadowBlur = 10;
    const lines = wrapText(ctx, c.text, w * 0.86, 2);
    const lh = fs * 1.28;
    const blockH = lines.length * lh;
    let cy = yNorm * h - blockH / 2 + lh / 2;
    if (cy + blockH / 2 > maxBottom) cy = maxBottom - blockH / 2;
    lines.forEach((ln, i) => drawStrokedLine(ctx, ln, w / 2, cy + i * lh, "#F0EFEC", strokeW));
    ctx.restore();
    return;
  }

  /* plate */
  const padX = 28 * (w / 1080);
  const boxW = Math.min(w * 0.86, w - 80 * (w / 1080));
  const fs = Math.round(w * 0.042);
  ctx.font = `600 ${fs}px Sora, system-ui, sans-serif`;
  const lines = wrapText(ctx, c.text, boxW - padX * 2, 2);
  const lh = fs * 1.28;
  const boxH = lines.length * lh + 28 * (w / 1080);
  const x = (w - boxW) / 2;
  let y = yNorm * h - boxH / 2;
  if (y + boxH > maxBottom) y = maxBottom - boxH;
  ctx.fillStyle = "rgba(13,15,20,0.78)";
  roundRect(ctx, x, y, boxW, boxH, 8 * (w / 1080));
  ctx.fill();
  ctx.fillStyle = "#F0EFEC";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((ln, i) => {
    ctx.fillText(ln, w / 2, y + 14 * (w / 1080) + lh / 2 + i * lh);
  });
  ctx.restore();
}

function roundRect(ctx: DrawCtx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawShape(ctx: DrawCtx, c: Clip, t: number, w: number, h: number) {
  if (!covers(c, t)) return;
  const lt = localT(c, t);
  const pop = easeOutBack(Math.min(1, lt / 0.28));
  ctx.save();
  ctx.globalAlpha *= opacityAt(c, t, 30) * pop;
  const cx = c.x * w;
  const cy = c.y * h;
  const s = Math.min(w, h) * 0.22 * c.scale;
  ctx.fillStyle = c.fill;
  if (c.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(cx, cy, s, s * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (c.shape === "star") {
    starPath(ctx, cx, cy, s);
    ctx.fill();
  } else {
    roundRect(ctx, cx - s, cy - s * 0.62, s * 2, s * 1.24, 18);
    ctx.fill();
  }
  ctx.restore();
}

function drawMediaClip(
  ctx: DrawCtx,
  c: Clip,
  t: number,
  w: number,
  h: number,
  bank: FrameBank,
  alpha: number,
  ox = 0,
  oy = 0,
) {
  const src = bank.frames.get(c.id);
  if (!src || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (c.type === "image" && (c.x !== 0.5 || c.y !== 0.5 || c.scale !== 1) && c.trackId !== "trk_v1") {
    const iw = w * 0.55 * c.scale;
    const ih = h * 0.35 * c.scale;
    const x = c.x * w - iw / 2 + ox;
    const y = c.y * h - ih / 2 + oy;
    ctx.drawImage(src, x, y, iw, ih);
  } else {
    drawImageCover(ctx, src, ox, oy, w, h);
  }
  ctx.restore();
}

/**
 * Single compositor used for preview AND export.
 * Callers must populate `bank.frames` for every visible media clip at time t.
 */
export function renderFrame(ctx: DrawCtx, t: number, project: Project, bank: FrameBank) {
  const { w, h } = ASPECT_SIZE[project.aspect];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if ("canvas" in ctx && (ctx.canvas.width !== w || ctx.canvas.height !== h)) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0D0F14";
  ctx.fillRect(0, 0, w, h);

  const fps = project.fps || 30;
  const videoTrack = project.tracks.find((tr) => tr.kind === "video");
  const overlayTrack = project.tracks.find((tr) => tr.kind === "overlay");

  const mediaTypes = new Set(["video", "image"]);
  const drawStack = (trackId: string | undefined) => {
    if (!trackId) return;
    const list = trackClips(project, trackId).filter((c) => mediaTypes.has(c.type));
    for (const c of list) {
      const vis = covers(c, t);
      const td = transDur(c, fps);
      const inWindow = td > 0 && t >= c.start && t < c.start + td;
      if (!vis && !inWindow) continue;
      const p = td > 0 ? (t - c.start) / td : 1;
      const prev = prevOnTrack(project, c);
      if (inWindow && c.transitionIn === "dissolve") {
        if (prev && mediaTypes.has(prev.type)) {
          drawMediaClip(ctx, prev, clipEnd(prev) - 0.001, w, h, bank, 1 - p);
        }
        drawMediaClip(ctx, c, t, w, h, bank, p);
      } else if (inWindow && c.transitionIn === "fade") {
        ctx.save();
        ctx.fillStyle = "#0D0F14";
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        drawMediaClip(ctx, c, t, w, h, bank, p);
      } else if (inWindow && c.transitionIn === "slide") {
        if (prev && mediaTypes.has(prev.type)) {
          drawMediaClip(ctx, prev, clipEnd(prev) - 0.001, w, h, bank, 1);
        }
        const ease = easeOutCubic(p);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        drawMediaClip(ctx, c, t, w, h, bank, 1, w * (1 - ease), 0);
        ctx.restore();
      } else if (inWindow && c.transitionIn === "wipe") {
        if (prev && mediaTypes.has(prev.type)) {
          drawMediaClip(ctx, prev, clipEnd(prev) - 0.001, w, h, bank, 1);
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w * easeOutCubic(p), h);
        ctx.clip();
        drawMediaClip(ctx, c, t, w, h, bank, 1);
        ctx.restore();
      } else if (vis) {
        drawMediaClip(ctx, c, t, w, h, bank, opacityAt(c, t, fps));
      }
    }
  };

  drawStack(videoTrack?.id);

  if (overlayTrack) {
    for (const c of trackClips(project, overlayTrack.id)) {
      if (c.type === "text") drawTextClip(ctx, c, t, w, h);
      else if (c.type === "shape") drawShape(ctx, c, t, w, h);
      else if (c.type === "image" || c.type === "video") {
        drawMediaClip(ctx, c, t, w, h, bank, opacityAt(c, t, fps));
      }
    }
  }

  const capTrack = project.tracks.find((tr) => tr.kind === "captions");
  if (capTrack) {
    for (const c of trackClips(project, capTrack.id)) {
      if (c.type === "caption") drawCaption(ctx, c, t, w, h, project);
    }
  }
}

export function visibleMediaClips(project: Project, t: number): Clip[] {
  const fps = project.fps || 30;
  return project.clips.filter((c) => {
    if (c.type !== "video" && c.type !== "image") return false;
    if (covers(c, t)) return true;
    const td = transDur(c, fps);
    if (td > 0 && (c.transitionIn === "dissolve" || c.transitionIn === "slide" || c.transitionIn === "wipe")) {
      const next = trackClips(project, c.trackId).find(
        (n) => n.start >= clipEnd(c) - 0.02 && n.start <= clipEnd(c) + 0.02,
      );
      if (next && t >= next.start && t < next.start + td) return true;
    }
    return false;
  });
}

export { projectDuration };
