import { useEffect, useRef } from "react";
import { clipEnd, clipSpeed, fmtSpeed, projectDuration, type Clip } from "../types";
import { useEditor } from "../store";
import { ensureThumb, media, peaksFor } from "../engine/media";

function kindClass(c: Clip) {
  if (c.type === "audio") return "audio";
  if (c.type === "caption") return "caption";
  if (c.type === "text" || c.type === "shape") return c.type;
  return "media";
}

function clipLabel(c: Clip, name?: string) {
  if (c.type === "caption") return (c.text || "caption").slice(0, 24);
  if (c.type === "text") return (c.text || "title").slice(0, 22);
  return (name || c.type).replace(/\.[^.]+$/, "");
}

function Film({ clip, width, height, zoom }: { clip: Clip; width: number; height: number; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = 2;
    canvas.width = Math.max(2, Math.floor(width * dpr));
    canvas.height = Math.max(2, Math.floor(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, "#3a3428");
    g.addColorStop(1, "#16181f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    if ((clip.type === "video" || clip.type === "image") && clip.assetId && zoom >= 64) {
      const thumb = ensureThumb(clip.assetId);
      const tile = Math.max(28, height * 1.45);
      const n = Math.max(1, Math.ceil(width / tile));
      for (let i = 0; i < n; i++) {
        ctx.drawImage(thumb, i * tile, 0, tile, height);
      }
    } else if ((clip.type === "video" || clip.type === "image") && clip.assetId) {
      const thumb = ensureThumb(clip.assetId);
      ctx.drawImage(thumb, 0, 0, width, height);
    }

    if ((clip.type === "audio" || (clip.type === "video" && clip.assetId)) && clip.assetId) {
      const peaks = peaksFor(clip.assetId, Math.max(24, Math.floor(width)));
      if (peaks) {
        ctx.fillStyle = "rgba(140,146,151,0.7)";
        const mid = height / 2;
        peaks.forEach((p, i) => {
          const h = Math.max(1, p * height * 0.6);
          ctx.fillRect(i * (width / peaks.length), mid - h / 2, 1, h);
        });
      }
    }
  }, [clip, width, height, zoom, clip.text, clip.assetId]);
  return <canvas ref={ref} className="film" />;
}

export function Timeline() {
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const selectedId = useEditor((s) => s.selectedId);
  const zoom = useEditor((s) => s.zoom);
  const snap = useEditor((s) => s.snap);
  const ripple = useEditor((s) => s.ripple);
  const snapGuide = useEditor((s) => s.snapGuide);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);
  const select = useEditor((s) => s.select);
  const moveClip = useEditor((s) => s.moveClip);
  const trimClip = useEditor((s) => s.trimClip);
  const finishEdit = useEditor((s) => s.finishEdit);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const deleteSelected = useEditor((s) => s.deleteSelected);
  const setZoom = useEditor((s) => s.setZoom);
  const fitZoom = useEditor((s) => s.fitZoom);
  const setSnap = useEditor((s) => s.setSnap);
  const setRipple = useEditor((s) => s.setRipple);
  const setMagnetic = useEditor((s) => s.setMagnetic);
  const cycleTransition = useEditor((s) => s.cycleTransition);
  const dropAsset = useEditor((s) => s.dropAsset);
  const push = useEditor((s) => s.push);
  const speedMarkIn = useEditor((s) => s.speedMarkIn);
  const speedMarkOut = useEditor((s) => s.speedMarkOut);
  const setSpeedMarks = useEditor((s) => s.setSpeedMarks);
  const dur = Math.max(8, projectDuration(project) + 2);
  const width = dur * zoom;
  const drag = useRef<{
    id: string;
    mode: "move" | "in" | "out" | "band" | "band-in" | "band-out";
    originX: number;
    originStart: number;
    originDur: number;
    alt?: boolean;
    bandA?: number;
  } | null>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const labW = typeof window !== "undefined" && window.matchMedia("(max-width: 959px)").matches ? 48 : 56;

  const timeFromX = (clientX: number) => {
    const sc = scrollRef.current;
    if (!sc) return 0;
    const x = clientX - sc.getBoundingClientRect().left + sc.scrollLeft - labW;
    return Math.max(0, x / zoom);
  };

  const onPointer = (e: React.PointerEvent, id: string, mode: "move" | "in" | "out" | "band" | "band-in" | "band-out") => {
    e.stopPropagation();
    const c = project.clips.find((x) => x.id === id);
    if (!c) return;
    select(id);
    if (mode === "move" || mode === "in" || mode === "out") push();
    drag.current = {
      id,
      mode,
      originX: e.clientX,
      originStart: c.start,
      originDur: c.duration,
      alt: e.altKey,
    };
    if (mode === "band") {
      const t = timeFromX(e.clientX);
      const tClip = Math.max(c.start, Math.min(t, clipEnd(c)));
      drag.current.bandA = tClip;
      setSpeedMarks(tClip, tClip);
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.originX) / zoom;
    if (d.mode === "move") moveClip(d.id, d.originStart + dt);
    else if (d.mode === "in") trimClip(d.id, "in", d.originStart + dt);
    else if (d.mode === "out") trimClip(d.id, "out", d.originStart + d.originDur + dt);
    else {
      const c = useEditor.getState().project.clips.find((x) => x.id === d.id);
      if (!c) return;
      const t = Math.max(c.start, Math.min(timeFromX(e.clientX), clipEnd(c)));
      if (d.mode === "band") setSpeedMarks(d.bandA ?? t, t);
      else if (d.mode === "band-in") setSpeedMarks(t, speedMarkOut ?? clipEnd(c));
      else setSpeedMarks(speedMarkIn ?? c.start, t);
    }
  };

  const onUp = () => {
    if (drag.current) finishEdit();
    drag.current = null;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const z = useEditor.getState().zoom;
        setZoom(z + (e.deltaY < 0 ? 12 : -12));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = labW + playhead * zoom;
    const view = el.clientWidth;
    const left = el.scrollLeft;
    const mid0 = left + view * 0.2;
    const mid1 = left + view * 0.8;
    if (x < mid0 || x > mid1) {
      el.scrollLeft = x - view * 0.5;
    }
  }, [playhead, playing, zoom]);

  const onTouch = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (!pinch.current) pinch.current = { dist, zoom };
      else {
        const ratio = dist / pinch.current.dist;
        setZoom(pinch.current.zoom * ratio);
      }
    }
  };

  const ticks = [];
  const step = zoom < 40 ? 5 : zoom < 70 ? 2 : 1;
  for (let s = 0; s <= dur; s += step) {
    ticks.push(
      <span key={s} className="tick" style={{ left: s * zoom + labW }}>
        {s}s
      </span>,
    );
  }

  const vClips = project.clips.filter((c) => c.trackId === "trk_v1").sort((a, b) => a.start - b.start);

  return (
    <div className="timeline">
      <div className="tl-tools">
        <button onClick={splitAtPlayhead}>Split</button>
        <button className={snap ? "on" : ""} onClick={() => setSnap(!snap)}>
          Snap
        </button>
        <button className={project.magnetic !== false ? "on" : ""} onClick={() => setMagnetic(project.magnetic === false)}>
          Mag
        </button>
        <button className={ripple ? "on" : ""} onClick={() => setRipple(!ripple)}>
          Ripple
        </button>
        <button onClick={() => deleteSelected(ripple)}>Del</button>
        <span className="tl-sp" />
        <button onClick={() => setZoom(zoom - 12)}>−</button>
        <button onClick={() => setZoom(zoom + 12)}>+</button>
        <button
          onClick={() => {
            const w = (scrollRef.current?.clientWidth || 640) - labW;
            fitZoom(w);
          }}
        >
          Fit
        </button>
      </div>
      <div
        className="tl-scroll"
        ref={scrollRef}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        onTouchEnd={() => (pinch.current = null)}
        onDragOver={(e) => {
          e.preventDefault();
        }}
      >
        <div
          className="tl-ruler"
          style={{ width: width + labW }}
          onPointerDown={(e) => {
            setPlaying(false);
            setPlayhead(timeFromX(e.clientX));
          }}
        >
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
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("assetId");
                if (id) dropAsset(id, tr.id, timeFromX(e.clientX));
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              {project.clips
                .filter((c) => c.trackId === tr.id)
                .map((c) => (
                  <div
                    key={c.id}
                    className={`clip ${kindClass(c)} ${selectedId === c.id ? "on" : ""} ${clipSpeed(c) !== 1 ? "sped" : ""}`}
                    style={{ left: c.start * zoom, width: Math.max(16, c.duration * zoom) }}
                    onPointerDown={(e) => onPointer(e, c.id, "move")}
                  >
                    <i className="handle in" onPointerDown={(e) => onPointer(e, c.id, "in")} />
                    {(c.type === "video" || c.type === "image" || c.type === "audio") && (
                      <Film clip={c} width={Math.max(16, c.duration * zoom)} height={tr.kind === "video" ? 48 : 30} zoom={zoom} />
                    )}
                    <span className="clip-lab">{clipLabel(c, assets[c.assetId || ""]?.name)}</span>
                    {clipSpeed(c) !== 1 && <em className="spd-badge">{fmtSpeed(clipSpeed(c))}</em>}
                    {(c.type === "video" || c.type === "audio") && selectedId === c.id && (
                      <>
                        <i
                          className="speed-rail"
                          title="Drag a stretch to speed"
                          onPointerDown={(e) => onPointer(e, c.id, "band")}
                        />
                        {speedMarkIn != null && speedMarkOut != null && (
                          <i
                            className="speed-band"
                            style={{
                              left: Math.max(0, (Math.min(speedMarkIn, speedMarkOut) - c.start) * zoom),
                              width: Math.max(4, Math.abs(speedMarkOut - speedMarkIn) * zoom),
                            }}
                          >
                            <b
                              className="band-h in"
                              onPointerDown={(e) => onPointer(e, c.id, "band-in")}
                            />
                            <b
                              className="band-h out"
                              onPointerDown={(e) => onPointer(e, c.id, "band-out")}
                            />
                          </i>
                        )}
                      </>
                    )}
                    <i className="handle out" onPointerDown={(e) => onPointer(e, c.id, "out")} />
                  </div>
                ))}
              {tr.kind === "video" &&
                vClips.map((c, i) => {
                  if (i === 0) return null;
                  const prev = vClips[i - 1];
                  if (Math.abs(c.start - clipEnd(prev)) > 0.05) return null;
                  return (
                    <button
                      key={`dia-${c.id}`}
                      className={`diamond ${c.transitionIn}`}
                      style={{ left: c.start * zoom }}
                      title={c.transitionIn}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        cycleTransition(c.id);
                      }}
                    />
                  );
                })}
            </div>
          </div>
        ))}
        <div className="playhead" style={{ left: labW + playhead * zoom }}>
          <b />
        </div>
        {snapGuide != null && (
          <div className="snap-line" style={{ left: labW + snapGuide * zoom }} />
        )}
      </div>
    </div>
  );
}
