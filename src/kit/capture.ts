import type { DrawCtx } from "../engine/overlay-fx";

let host: HTMLElement | null = null;

export function registerKitHost(el: HTMLElement | null) {
  host = el;
}

export function kitHost() {
  return host;
}

function blitCanvases(ctx: DrawCtx, w: number, h: number, el: HTMLElement) {
  const hr = el.getBoundingClientRect();
  if (hr.width < 2 || hr.height < 2) return false;
  const canvases = el.querySelectorAll("canvas");
  let n = 0;
  canvases.forEach((c) => {
    const r = c.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    try {
      ctx.drawImage(
        c,
        ((r.left - hr.left) / hr.width) * w,
        ((r.top - hr.top) / hr.height) * h,
        (r.width / hr.width) * w,
        (r.height / hr.height) * h,
      );
      n++;
    } catch {
      /* tainted */
    }
  });
  return n > 0;
}

export async function blitKit(ctx: DrawCtx, w: number, h: number) {
  const el = host;
  if (!el) return;
  try {
    const { toCanvas } = await import("html-to-image");
    const shot = await toCanvas(el, {
      width: Math.round(el.getBoundingClientRect().width) || w,
      height: Math.round(el.getBoundingClientRect().height) || h,
      pixelRatio: Math.max(1, w / Math.max(1, el.getBoundingClientRect().width)),
      cacheBust: false,
      backgroundColor: "transparent",
    });
    ctx.drawImage(shot, 0, 0, w, h);
    return;
  } catch {
    blitCanvases(ctx, w, h, el);
  }
}
