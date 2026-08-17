import { useEffect, useRef } from "react";
import { clipEnd, clipSpeed, fmtSpeed, projectDuration, type Clip } from "../types";
import { useEditor, watchPlayhead } from "../store";
import { ensureThumb, peaksFor } from "../engine/media";

type DragMode = "move" | "in" | "out" | "band" | "band-in" | "band-out" | "scrub";

function PlayheadNeedle({ zoom }: { zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return watchPlayhead((t) => {
      const el = ref.current;
      if (el) el.style.left = `${t * zoom}px`;
    });
  }, [zoom]);
  return (
    <div className="playhead" ref={ref} style={{ left: 0 }}>
      <b />
    </div>
  );
}

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
  }, [clip.type, clip.assetId, clip.text, width, height, zoom]);
  return <canvas ref={ref} className="film" />;
}

export function Timeline() {
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
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
    mode: DragMode;
    originX: number;
    originStart: number;
    originDur: number;
    originPlayhead: number;
    grabOffset: number;
    rawStart: number;
    pointerId: number;
    alt?: boolean;
    bandA?: number;
  } | null>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const holdX = useRef(0);
  const autoRaf = useRef(0);
  const applyDragRef = useRef<(x: number) => void>(() => {});
  const tickAutoRef = useRef<() => void>(() => {});

  const setDragging = (on: boolean) => {
    scrollRef.current?.classList.toggle("dragging", on);
  };

  const timeFromX = (clientX: number) => {
    const sc = scrollRef.current;
    if (!sc) return 0;
    const x = clientX - sc.getBoundingClientRect().left + sc.scrollLeft;
    return x / zoom;
  };

  const applyDrag = (clientX: number) => {
    const d = drag.current;
    if (!d) return;
    const t = timeFromX(clientX);
    if (d.mode === "scrub") {
      setPlayhead(Math.max(0, t));
      return;
    }
    const meta = { origin: d.originStart, playhead: d.originPlayhead, prev: d.rawStart };
    if (d.mode === "move") {
      const start = t - d.grabOffset;
      d.rawStart = start;
      moveClip(d.id, start, meta);
    } else if (d.mode === "in") {
      d.rawStart = t;
      trimClip(d.id, "in", t, { ...meta, origin: d.originStart });
    } else if (d.mode === "out") {
      d.rawStart = t;
      trimClip(d.id, "out", t, { ...meta, origin: d.originStart + d.originDur });
    } else {
      const c = useEditor.getState().project.clips.find((x) => x.id === d.id);
      if (!c) return;
      const clipped = Math.max(c.start, Math.min(t, clipEnd(c)));
      if (d.mode === "band") setSpeedMarks(d.bandA ?? clipped, clipped);
      else if (d.mode === "band-in") setSpeedMarks(clipped, speedMarkOut ?? clipEnd(c));
      else setSpeedMarks(speedMarkIn ?? c.start, clipped);
    }
  };

  const stopAuto = () => {
    if (autoRaf.current) cancelAnimationFrame(autoRaf.current);
    autoRaf.current = 0;
  };

  const tickAuto = () => {
    const d = drag.current;
    const sc = scrollRef.current;
    if (!d || !sc) {
      stopAuto();
      return;
    }
    const r = sc.getBoundingClientRect();
    const x = holdX.current;
    const zone = 64;
    let dx = 0;
    if (x < r.left + zone) dx = -Math.max(14, Math.round((zone - (x - r.left)) * 0.9));
    else if (x > r.right - zone) dx = Math.max(14, Math.round((x - (r.right - zone)) * 0.9));
    if (!dx) {
      autoRaf.current = 0;
      return;
    }
    sc.scrollLeft = Math.max(0, sc.scrollLeft + dx);
    applyDragRef.current(x);
    autoRaf.current = requestAnimationFrame(() => tickAutoRef.current());
  };

  const onPointer = (e: React.PointerEvent, id: string, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    const c = project.clips.find((x) => x.id === id);
    if (!c) return;
    select(id);
    if (mode === "move" || mode === "in" || mode === "out") push();
    const t0 = timeFromX(e.clientX);
    drag.current = {
      id,
      mode,
      originX: e.clientX,
      originStart: c.start,
      originDur: c.duration,
      originPlayhead: useEditor.getState().playhead,
      grabOffset: t0 - c.start,
      rawStart: c.start,
      pointerId: e.pointerId,
      alt: e.altKey,
    };
    holdX.current = e.clientX;
    if (mode === "band") {
      const tClip = Math.max(c.start, Math.min(t0, clipEnd(c)));
      drag.current.bandA = tClip;
      setSpeedMarks(tClip, tClip);
    }
    const cap = e.currentTarget as HTMLElement;
    if (cap.setPointerCapture) cap.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const beginScrub = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest(".clip, .handle, .diamond, .speed-rail, .speed-band")) return;
    e.stopPropagation();
    e.preventDefault();
    setPlaying(false);
    const t0 = Math.max(0, timeFromX(e.clientX));
    setPlayhead(t0);
    select(null);
    drag.current = {
      id: "",
      mode: "scrub",
      originX: e.clientX,
      originStart: t0,
      originDur: 0,
      originPlayhead: t0,
      grabOffset: 0,
      rawStart: t0,
      pointerId: e.pointerId,
    };
    holdX.current = e.clientX;
    const cap = e.currentTarget as HTMLElement;
    if (cap.setPointerCapture) cap.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const endDrag = () => {
    stopAuto();
    const d = drag.current;
    if (d && d.mode !== "scrub") finishEdit();
    drag.current = null;
    setDragging(false);
  };

  applyDragRef.current = applyDrag;
  tickAutoRef.current = tickAuto;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      e.preventDefault();
      holdX.current = e.clientX;
      applyDragRef.current(e.clientX);
      if (!autoRaf.current) autoRaf.current = requestAnimationFrame(() => tickAutoRef.current());
    };
    const up = () => endDrag();
    const touchMove = (e: TouchEvent) => {
      if (!drag.current) return;
      e.preventDefault();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("touchmove", touchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("touchmove", touchMove);
    };
  }, [finishEdit]);

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
    return watchPlayhead((t) => {
      const el = scrollRef.current;
      if (!el || drag.current) return;
      const x = t * zoom;
      const view = el.clientWidth;
      const left = el.scrollLeft;
      const mid0 = left + view * 0.2;
      const mid1 = left + view * 0.8;
      if (x < mid0 || x > mid1) el.scrollLeft = x - view * 0.5;
    });
  }, [playing, zoom]);

  const onTouch = (e: React.TouchEvent) => {
    if (drag.current) return;
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
      <span key={s} className={`tick${s === 0 ? " origin" : ""}`} style={{ left: s * zoom }}>
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
            const w = scrollRef.current?.clientWidth || 640;
            fitZoom(w);
          }}
        >
          Fit
        </button>
      </div>
      <div className="tl-body">
        <div className="tl-rail">
          <div className="tl-rail-head" />
          {project.tracks.map((tr) => (
            <div key={tr.id} className={`track-lab ${tr.kind}`}>
              {tr.name}
            </div>
          ))}
        </div>
        <div
          className="tl-scroll"
          ref={scrollRef}
          onTouchStart={onTouch}
          onTouchMove={onTouch}
          onTouchEnd={() => (pinch.current = null)}
          onDragOver={(e) => {
            e.preventDefault();
          }}
        >
          <div className="tl-ruler" style={{ width }} onPointerDown={beginScrub}>
            {ticks}
          </div>
          {project.tracks.map((tr) => (
            <div key={tr.id} className={`track ${tr.kind}`}>
              <div
                className="lane"
                ref={tr.kind === "video" ? laneRef : undefined}
                style={{ width }}
                onPointerDown={beginScrub}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("assetId");
                  if (id) dropAsset(id, tr.id, Math.max(0, timeFromX(e.clientX)));
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                {project.clips
                  .filter((c) => c.trackId === tr.id)
                  .map((c) => (
                    <div
                      key={c.id}
                      className={`clip ${kindClass(c)} ${selectedId === c.id ? "on" : ""} ${clipSpeed(c) !== 1 ? "sped" : ""}`}
                      style={{ left: c.start * zoom, width: Math.max(16, c.duration * zoom), touchAction: "none" }}
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
                              <b className="band-h in" onPointerDown={(e) => onPointer(e, c.id, "band-in")} />
                              <b className="band-h out" onPointerDown={(e) => onPointer(e, c.id, "band-out")} />
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
          <PlayheadNeedle zoom={zoom} />
          {snapGuide != null && <div className="snap-line" style={{ left: snapGuide * zoom }} />}
        </div>
      </div>
    </div>
  );
}
