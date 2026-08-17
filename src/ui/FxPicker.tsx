import { useState } from "react";
import { useEditor } from "../store";
import type { TextPreset } from "../types";
import { OVERLAY_CATS, type OverlayCat } from "../engine/overlays";

function TitleTile({
  preset,
  name,
  poster,
  onPick,
}: {
  preset: TextPreset;
  name: string;
  poster?: string;
  onPick: () => void;
}) {
  return (
    <button className="title-tile" type="button" data-fx={preset} aria-label={name} onClick={onPick}>
      {poster ? <img src={poster} alt="" /> : <i className="title-ph" />}
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
            poster={p.poster}
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
