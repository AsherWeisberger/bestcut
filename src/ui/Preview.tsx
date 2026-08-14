import { useEffect, useRef } from "react";
import { ASPECT_SIZE, FPS, projectDuration } from "../types";
import { useEditor } from "../store";
import { media } from "../engine/media";
import { PreviewAudio } from "../engine/audio";
import { renderFrame, visibleMediaClips, type FrameBank } from "../engine/render";

const audio = new PreviewAudio();

function fmt(t: number) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${r.toFixed(2).padStart(5, "0")}`;
}

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = useEditor((s) => s.project);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const undo = useEditor((s) => s.undo);
  const size = ASPECT_SIZE[project.aspect];
  const dur = projectDuration(project);

  const paint = (t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (canvas.width !== size.w) canvas.width = size.w;
    if (canvas.height !== size.h) canvas.height = size.h;
    const bank: FrameBank = { frames: new Map() };
    for (const c of visibleMediaClips(project, t)) {
      if (!c.assetId) continue;
      if (c.type === "image") {
        const img = media.images.get(c.assetId);
        if (img) bank.frames.set(c.id, img);
      } else {
        const v = media.videos.get(c.assetId);
        if (v) bank.frames.set(c.id, v);
      }
    }
    renderFrame(ctx, t, project, bank);
  };

  useEffect(() => {
    paint(playhead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, project, size.w, size.h]);

  useEffect(() => {
    if (!playing) {
      audio.stop();
      for (const v of media.videos.values()) v.pause();
      return;
    }
    let raf = 0;
    let last = performance.now();
    let t = useEditor.getState().playhead;
    audio.play(project, t, dur).catch(() => {});
    for (const c of project.clips) {
      if (c.type !== "video" || !c.assetId) continue;
      const v = media.videos.get(c.assetId);
      if (!v) continue;
      const st = c.trimIn + Math.max(0, t - c.start);
      v.currentTime = st;
      v.muted = true;
      v.play().catch(() => {});
    }
    const loop = (now: number) => {
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      t += dt;
      if (t >= dur) {
        t = dur;
        useEditor.getState().setPlaying(false);
        useEditor.getState().setPlayhead(t);
        paint(t);
        return;
      }
      useEditor.getState().setPlayhead(t);
      paint(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying(!useEditor.getState().playing);
      }
      if (e.key === "s" || e.key === "S") splitAtPlayhead();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useEditor.getState().redo();
        else undo();
      }
      if (e.key === "Delete" || e.key === "Backspace") useEditor.getState().deleteSelected(e.shiftKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPlaying, splitAtPlayhead, undo]);

  const ratio = size.w / size.h;

  return (
    <div className="preview-wrap">
      <div className="stage-frame" style={{ aspectRatio: `${size.w} / ${size.h}`, width: ratio < 1 ? "min(100%, 42vh)" : "min(100%, 720px)" }}>
        <canvas ref={canvasRef} width={size.w} height={size.h} />
      </div>
      <div className="transport">
        <button className="icon-btn" onClick={undo} title="Undo">
          ↺
        </button>
        <button
          className="icon-btn play"
          onClick={() => setPlaying(!playing)}
          title="Play"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button className="icon-btn" onClick={splitAtPlayhead} title="Split">
          ✂
        </button>
        <div className="tc">
          {fmt(playhead)} / {fmt(dur)}
        </div>
        <span className="tc">{FPS} fps</span>
      </div>
    </div>
  );
}
