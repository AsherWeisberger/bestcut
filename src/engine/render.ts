import {
  ASPECT_SIZE,
  type Clip,
  type Project,
  clipEnd,
  projectDuration,
} from "../types";

export type DrawCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type FrameBank = {
  /** clipId -> drawable frame at current t */
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

function clipsOf(p: Project, kind: Clip["type"] | Clip["type"][]) {
  const set = new Set(Array.isArray(kind) ? kind : [kind]);
  return p.clips.filter((c) => set.has(c.type));
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
  const iw = (img as HTMLVideoElement).videoWidth || (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || dw;
  const ih = (img as HTMLVideoElement).videoHeight || (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || dh;
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

function kinetic(
  c: Clip,
  t: number,
): { opacity: number; ty: number; scale: number; chars: number } {
  const lt = Math.max(0, localT(c, t));
  const outStart = Math.max(0, c.duration - 0.32);
  const inP = Math.min(1, lt / 0.38);
  const outP = lt > outStart ? Math.min(1, (lt - outStart) / 0.32) : 0;
  let opacity = 1;
  let ty = 0;
  let scale = 1;
  const len = c.text.length;
  let chars = len;

  if (c.preset === "fade") {
    opacity = easeOutCubic(inP) * (1 - outP);
  } else if (c.preset === "slide-up") {
    opacity = easeOutCubic(inP) * (1 - outP);
    ty = (1 - easeOutCubic(inP)) * 36 + outP * 12;
  } else if (c.preset === "pop") {
    opacity = Math.min(1, inP * 1.4) * (1 - outP);
    scale = 0.72 + easeOutBack(inP) * 0.28;
  } else {
    opacity = 1 - outP * 0.85;
    chars = Math.max(0, Math.floor(len * Math.min(1, lt / Math.max(0.45, len * 0.045))));
  }
  return { opacity, ty, scale, chars };
}

function wrapText(ctx: DrawCtx, text: string, maxW: number): string[] {
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
  return lines.slice(0, 6);
}

function drawTextClip(ctx: DrawCtx, c: Clip, t: number, w: number, h: number) {
  if (!covers(c, t) || !c.text) return;
  const k = kinetic(c, t);
  const shown = c.preset === "type-on" ? c.text.slice(0, k.chars) : c.text;
  if (!shown) return;
  ctx.save();
  ctx.globalAlpha *= k.opacity;
  const cx = c.x * w;
  const cy = c.y * h + k.ty;
  ctx.translate(cx, cy);
  ctx.scale(k.scale * c.scale, k.scale * c.scale);
  ctx.fillStyle = c.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${c.fontSize}px Fraunces, Georgia, serif`;
  const lines = wrapText(ctx, shown, w * 0.86);
  const lh = c.fontSize * 1.12;
  const top = -((lines.length - 1) * lh) / 2;
  ctx.shadowColor = "rgba(13,15,20,0.55)";
  ctx.shadowBlur = 18;
  lines.forEach((ln, i) => ctx.fillText(ln, 0, top + i * lh));
  ctx.restore();
}

function drawCaption(ctx: DrawCtx, c: Clip, t: number, w: number, h: number) {
  if (!covers(c, t) || !c.text) return;
  const lt = localT(c, t);
  const fade = Math.min(1, lt / 0.12, (c.duration - lt) / 0.12);
  ctx.save();
  ctx.globalAlpha *= Math.max(0, fade);
  const padX = 28;
  const boxW = Math.min(w * 0.86, w - 80);
  ctx.font = `600 ${Math.round(w * 0.042)}px Sora, system-ui, sans-serif`;
  const lines = wrapText(ctx, c.text, boxW - padX * 2);
  const fs = Math.round(w * 0.042);
  const lh = fs * 1.28;
  const boxH = lines.length * lh + 28;
  const x = (w - boxW) / 2;
  const y = h * 0.78 - boxH / 2;
  ctx.fillStyle = "rgba(13,15,20,0.78)";
  roundRect(ctx, x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.fillStyle = "#F0EFEC";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((ln, i) => {
    ctx.fillText(ln, w / 2, y + 14 + lh / 2 + i * lh);
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
) {
  const src = bank.frames.get(c.id);
  if (!src || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (c.type === "image" && (c.x !== 0.5 || c.y !== 0.5 || c.scale !== 1)) {
    const iw = w * 0.55 * c.scale;
    const ih = h * 0.35 * c.scale;
    const x = c.x * w - iw / 2;
    const y = c.y * h - ih / 2;
    ctx.drawImage(src, x, y, iw, ih);
  } else {
    drawImageCover(ctx, src, 0, 0, w, h);
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
      if (inWindow && c.transitionIn === "dissolve") {
        const prev = prevOnTrack(project, c);
        const p = (t - c.start) / td;
        if (prev && mediaTypes.has(prev.type)) {
          drawMediaClip(ctx, prev, clipEnd(prev) - 0.001, w, h, bank, 1 - p);
        }
        drawMediaClip(ctx, c, t, w, h, bank, p);
      } else if (inWindow && c.transitionIn === "fade") {
        const p = (t - c.start) / td;
        ctx.save();
        ctx.fillStyle = "#0D0F14";
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        drawMediaClip(ctx, c, t, w, h, bank, p);
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
      if (c.type === "caption") drawCaption(ctx, c, t, w, h);
    }
  }
}

export function visibleMediaClips(project: Project, t: number): Clip[] {
  const fps = project.fps || 30;
  return project.clips.filter((c) => {
    if (c.type !== "video" && c.type !== "image") return false;
    if (covers(c, t)) return true;
    const td = transDur(c, fps);
    if (td > 0 && c.transitionIn === "dissolve") {
      const next = trackClips(project, c.trackId).find(
        (n) => n.start >= clipEnd(c) - 0.02 && n.start <= clipEnd(c) + 0.02,
      );
      if (next && t >= next.start && t < next.start + td) return true;
    }
    return false;
  });
}

export { projectDuration };
