import { useEffect, useRef } from "react";
import { useEditor } from "../store";
import { TRANSITIONS, type TransitionKind } from "../types";
import { ensureThumb } from "../engine/media";
import { fmtTime } from "../types";
import { FxPicker } from "./FxPicker";

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

const TABS = [
  { id: "fx" as const, label: "FX" },
  { id: "media" as const, label: "Media" },
  { id: "captions" as const, label: "Captions" },
  { id: "trans" as const, label: "Trans" },
];

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
  const addCaption = useEditor((s) => s.addCaption);
  const setTransition = useEditor((s) => s.setTransition);
  const selectedId = useEditor((s) => s.selectedId);
  const list = Object.values(assets);

  return (
    <aside className="bin">
      <div className="pane-h">{binTab === "fx" ? "Effects" : "Media"}</div>
      <div className="bin-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={binTab === t.id ? "on" : ""} onClick={() => setBinTab(t.id)}>
            {t.label}
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
        {binTab === "fx" && <FxPicker />}
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
