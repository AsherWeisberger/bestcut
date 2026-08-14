import { useEffect, useRef } from "react";
import { useEditor } from "../store";
import { blankClip, TITLE_INS, TRANSITIONS, type TextPreset, type TransitionKind } from "../types";
import { ensureThumb } from "../engine/media";
import { kinetic } from "../engine/render";
import { fmtTime } from "../types";

function TitleTile({ preset, onPick }: { preset: TextPreset; onPick: () => void }) {
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
    const loop = (now: number) => {
      const t = ((now - t0) / 1000) % 1.4;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0D0F14";
      ctx.fillRect(0, 0, 120, 68);
      const k = kinetic(clip, t);
      ctx.save();
      ctx.globalAlpha = k.opacity;
      ctx.translate(60 + k.tx, 36 + k.ty);
      ctx.scale(k.scale, k.scale);
      ctx.fillStyle = "#F0EFEC";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 28px Fraunces, Georgia, serif";
      const shown = preset === "type" ? "Aa".slice(0, k.chars) : "Aa";
      if (preset === "split" && k.split > 0.2) {
        ctx.fillText("A", -8 - k.split, 0);
        ctx.fillText("a", 8 + k.split, 0);
      } else if (shown) ctx.fillText(shown, 0, 0);
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [preset]);
  const name = TITLE_INS.find((t) => t.id === preset)?.name || preset;
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
  const addText = useEditor((s) => s.addText);
  const addCaption = useEditor((s) => s.addCaption);
  const setTransition = useEditor((s) => s.setTransition);
  const selectedId = useEditor((s) => s.selectedId);
  const list = Object.values(assets);

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
            <button className="import-tile" onClick={onImport}>
              Drop files or import
            </button>
            {list.map((a) => (
              <AssetCard key={a.id} id={a.id} name={a.name} kind={a.kind} duration={a.duration} />
            ))}
            {!list.length && <p className="hint">Drag a card onto a track.</p>}
          </>
        )}
        {binTab === "titles" && (
          <div className="title-grid">
            {TITLE_INS.map((p) => (
              <TitleTile key={p.id} preset={p.id as TextPreset} onPick={() => addText(p.id)} />
            ))}
          </div>
        )}
        {binTab === "captions" && (
          <>
            <p className="hint">Auto caption splits a transcript onto the voice clip. Styles burn into the frame.</p>
            <button className="ghost" onClick={onCaptionPass}>
              Auto caption
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
