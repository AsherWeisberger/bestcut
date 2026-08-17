import { useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { blankClip, TRANSITIONS, type TextPreset, type TransitionKind } from "../types";
import { ensureThumb } from "../engine/media";
import { OVERLAY_CATS, drawTitleOverlay, type OverlayCat } from "../engine/overlays";
import { fmtTime } from "../types";

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
    const paint = (now: number) => {
      const t = ((now - t0) / 1000) % 1.4;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0D0F14";
      ctx.fillRect(0, 0, 120, 68);
      drawTitleOverlay(ctx, clip, t, 120, 68);
    };
    const loop = (now: number) => {
      if (!vis) return;
      paint(now);
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
    <button className="title-tile" onClick={onPick}>
      <canvas ref={ref} width={120} height={68} />
      <span>{name}</span>
    </button>
  );
}

function AssetCard({
  id,
  name,
  kind,
  duration,
}: {
  id: string;
  name: string;
  kind: string;
  duration: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const thumb = ensureThumb(id);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(thumb, 0, 0, 64, 48);
  }, [id]);
  return (
    <div
      className="asset"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("assetId", id);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <canvas ref={ref} className="asset-thumb" width={64} height={48} />
      <div>
        <b>{name.replace(/\.[^.]+$/, "")}</b>
        <span>
          {fmtTime(duration).replace(/^00:/, "0:")} · {kind}
        </span>
      </div>
    </div>
  );
}

export function Bin({
  onImport,
  onCaptionPass,
}: {
  onImport: () => void;
  onCaptionPass: () => void;
}) {
  const assets = useEditor((s) => s.assets);
  const binTab = useEditor((s) => s.binTab);
  const setBinTab = useEditor((s) => s.setBinTab);
  const importFiles = useEditor((s) => s.importFiles);
  const addText = useEditor((s) => s.addText);
  const addCaption = useEditor((s) => s.addCaption);
  const setTransition = useEditor((s) => s.setTransition);
  const selectedId = useEditor((s) => s.selectedId);
  const list = Object.values(assets);
  const [titleCat, setTitleCat] = useState<OverlayCat>("kinetic");
  const titleItems = (OVERLAY_CATS.find((c) => c.id === titleCat) || OVERLAY_CATS[0]).items;

  return (
    <aside className="bin">
      <div className="pane-h">Media</div>
      <div className="bin-tabs">
        {(["media", "titles", "captions", "trans"] as const).map((t) => (
          <button key={t} className={binTab === t ? "on" : ""} onClick={() => setBinTab(t)}>
            {t === "trans" ? "Trans" : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="bin-list">
        {binTab === "media" && (
          <>
            <button
              className="import-tile"
              onClick={onImport}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = e.dataTransfer.files;
                if (files?.length) importFiles([...files]);
              }}
            >
              Drop files or import
            </button>
            {list.map((a) => (
              <AssetCard key={a.id} id={a.id} name={a.name} kind={a.kind} duration={a.duration} />
            ))}
            {!list.length && <p className="hint">Drag a card onto a track.</p>}
          </>
        )}
        {binTab === "titles" && (
          <>
            <div className="cat-rail" role="tablist" aria-label="Title look">
              {OVERLAY_CATS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={titleCat === cat.id ? "on" : ""}
                  onClick={() => setTitleCat(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="title-grid">
              {titleItems.map((p) => (
                <TitleTile key={p.id} preset={p.id} name={p.name} onPick={() => addText(p.id)} />
              ))}
            </div>
          </>
        )}
        {binTab === "captions" && (
          <>
            <p className="hint">Caption pass splits a transcript onto the voice clip. Styles burn into the frame.</p>
            <button className="ghost" onClick={onCaptionPass}>
              Caption pass
            </button>
            <button className="ghost" onClick={() => addCaption()}>
              Add line
            </button>
          </>
        )}
        {binTab === "trans" && (
          <>
            <p className="hint">Diamonds on the cut cycle these. Applies to the selected clip.</p>
            <div className="trans-list">
              {TRANSITIONS.map((k) => (
                <button
                  key={k}
                  className="ghost"
                  disabled={!selectedId}
                  onClick={() => setTransition(k as TransitionKind)}
                >
                  {k}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
