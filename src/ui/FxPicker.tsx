import { useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { blankClip, type TextPreset } from "../types";
import { OVERLAY_CATS, drawTitleOverlay, type OverlayCat } from "../engine/overlays";

function TitleTile({ preset, name, onPick }: { preset: TextPreset; name: string; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = 120;
    canvas.height = 68;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t0 = performance.now();
    let vis = true;
    const clip = blankClip({
      trackId: "trk_ov",
      type: "text",
      start: 0,
      duration: 1.4,
      text: "Aa",
      preset,
      inPreset: preset,
      fontSize: 28,
      y: 0.5,
      x: 0.5,
      textFace: "fraunces",
      inDur: 0.38,
      outDur: 0.18,
    });
    const reduced =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paint = (now: number) => {
      const t = reduced ? 0.9 : ((now - t0) / 1000) % 1.4;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0D0F14";
      ctx.fillRect(0, 0, 120, 68);
      drawTitleOverlay(ctx, clip, t, 120, 68);
    };
    const loop = (now: number) => {
      if (!vis) return;
      paint(now);
      if (reduced) return;
      raf = requestAnimationFrame(loop);
    };
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver((entries) => {
            vis = !!(entries[0] && entries[0].isIntersecting);
            if (vis) raf = requestAnimationFrame(loop);
            else if (raf) cancelAnimationFrame(raf);
          })
        : null;
    if (io) io.observe(canvas);
    raf = requestAnimationFrame(loop);
    return () => {
      vis = false;
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
    };
  }, [preset]);
  return (
    <button className="title-tile" type="button" data-fx={preset} aria-label={name} onClick={onPick}>
      <canvas ref={ref} width={120} height={68} />
      <span>{name}</span>
    </button>
  );
}

export function FxPicker({ onPicked }: { onPicked?: () => void }) {
  const addText = useEditor((s) => s.addText);
  const [cat, setCat] = useState<OverlayCat>("kinetic");
  const items = (OVERLAY_CATS.find((c) => c.id === cat) || OVERLAY_CATS[0]).items;

  return (
    <div className="fx-picker" data-fx-bin="1">
      <div className="cat-rail" role="tablist" aria-label="Effects">
        {OVERLAY_CATS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={cat === c.id}
            className={cat === c.id ? "on" : ""}
            onClick={() => setCat(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="title-grid">
        {items.map((p) => (
          <TitleTile
            key={p.id}
            preset={p.id}
            name={p.name}
            onPick={() => {
              addText(p.id);
              onPicked?.();
            }}
          />
        ))}
      </div>
    </div>
  );
}
