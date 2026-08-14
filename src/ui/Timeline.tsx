import { useRef } from "react";
import { clipEnd, projectDuration, type Clip } from "../types";
import { useEditor } from "../store";

function kindClass(c: Clip) {
  if (c.type === "audio") return "audio";
  if (c.type === "caption") return "caption";
  if (c.type === "text" || c.type === "shape") return c.type;
  return "";
}

export function Timeline() {
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const playhead = useEditor((s) => s.playhead);
  const selectedId = useEditor((s) => s.selectedId);
  const zoom = useEditor((s) => s.zoom);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);
  const select = useEditor((s) => s.select);
  const moveClip = useEditor((s) => s.moveClip);
  const trimClip = useEditor((s) => s.trimClip);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const deleteSelected = useEditor((s) => s.deleteSelected);
  const setZoom = useEditor((s) => s.setZoom);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const addText = useEditor((s) => s.addText);
  const addCaption = useEditor((s) => s.addCaption);
  const dur = Math.max(8, projectDuration(project) + 2);
  const width = dur * zoom;
  const drag = useRef<{ id: string; mode: "move" | "in" | "out"; originX: number; originStart: number; originDur: number } | null>(null);
  const laneRef = useRef<HTMLDivElement>(null);

  const timeFromX = (clientX: number) => {
    const el = laneRef.current;
    if (!el) return 0;
    const x = clientX - el.getBoundingClientRect().left + el.parentElement!.scrollLeft - 72;
    return Math.max(0, x / zoom);
  };

  const onPointer = (e: React.PointerEvent, id: string, mode: "move" | "in" | "out") => {
    e.stopPropagation();
    const c = project.clips.find((x) => x.id === id);
    if (!c) return;
    select(id);
    drag.current = { id, mode, originX: e.clientX, originStart: c.start, originDur: c.duration };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.originX) / zoom;
    if (d.mode === "move") moveClip(d.id, d.originStart + dt);
    else if (d.mode === "in") trimClip(d.id, "in", d.originStart + dt);
    else trimClip(d.id, "out", d.originStart + d.originDur + dt);
  };

  const ticks = [];
  for (let s = 0; s <= dur; s++) {
    ticks.push(
      <span key={s} style={{ position: "absolute", left: s * zoom + 72, top: 4 }}>
        {s}s
      </span>,
    );
  }

  return (
    <div className="timeline">
      <div className="tl-tools">
        <button onClick={splitAtPlayhead}>Split</button>
        <button onClick={() => deleteSelected(false)}>Delete</button>
        <button onClick={() => deleteSelected(true)}>Ripple</button>
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
        <button onClick={() => addText("slide-up")}>Title</button>
        <button onClick={() => addCaption()}>Caption</button>
        <button onClick={() => setZoom(zoom - 12)}>−</button>
        <button onClick={() => setZoom(zoom + 12)}>+</button>
      </div>
      <div className="tl-scroll" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <div className="tl-ruler" style={{ width: width + 72 }}>
          {ticks}
        </div>
        {project.tracks.map((tr) => (
          <div key={tr.id} className={`track ${tr.kind}`}>
            <div className="track-lab">{tr.name}</div>
            <div
              className="lane"
              ref={tr.kind === "video" ? laneRef : undefined}
              style={{ width }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).classList.contains("lane")) {
                  setPlaying(false);
                  setPlayhead(timeFromX(e.clientX));
                  select(null);
                }
              }}
            >
              {project.clips
                .filter((c) => c.trackId === tr.id)
                .map((c) => (
                  <div
                    key={c.id}
                    className={`clip ${kindClass(c)} ${selectedId === c.id ? "on" : ""}`}
                    style={{ left: c.start * zoom, width: Math.max(16, c.duration * zoom) }}
                    onPointerDown={(e) => onPointer(e, c.id, "move")}
                  >
                    <i className="handle in" onPointerDown={(e) => onPointer(e, c.id, "in")} />
                    {c.text || assets[c.assetId || ""]?.name?.replace(/\.[^.]+$/, "") || c.type}
                    <i className="handle out" onPointerDown={(e) => onPointer(e, c.id, "out")} />
                  </div>
                ))}
            </div>
          </div>
        ))}
        <div className="playhead" style={{ left: 72 + playhead * zoom }} />
      </div>
    </div>
  );
}
