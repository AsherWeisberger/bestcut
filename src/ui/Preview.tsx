import { useEffect, useRef } from "react";
import { ASPECT_SIZE, fmtTime, projectDuration } from "../types";
import { useEditor } from "../store";
import { media } from "../engine/media";
import { PreviewAudio } from "../engine/audio";
import { renderFrame, visibleMediaClips, type FrameBank } from "../engine/render";
import { IconPause, IconPlay, IconSplit, IconUndo } from "./icons";

const audio = new PreviewAudio();

export function Preview({ onExport }: { onExport?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = useEditor((s) => s.project);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const selectedId = useEditor((s) => s.selectedId);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const undo = useEditor((s) => s.undo);
  const size = ASPECT_SIZE[project.aspect];
  const dur = projectDuration(project);
  const selected = project.clips.find((c) => c.id === selectedId);
  const safeOn = selected?.type === "text" || selected?.type === "caption";
  const vertical = size.h >= size.w;

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
      const spd = c.speed && c.speed > 0 ? c.speed : 1;
      const st = c.trimIn + Math.max(0, t - c.start) * spd;
      v.currentTime = st;
      v.muted = true;
      v.playbackRate = spd;
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
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const ed = useEditor.getState();
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying(!ed.playing);
      }
      if (e.key === "s" || e.key === "S" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b")) {
        e.preventDefault();
        splitAtPlayhead();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        onExport?.();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        ed.duplicateSelected();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        ed.deleteSelected(e.shiftKey);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlayhead(ed.playhead - (e.shiftKey ? 1 : 1 / 30));
        setPlaying(false);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlayhead(ed.playhead + (e.shiftKey ? 1 : 1 / 30));
        setPlaying(false);
      }
      if (e.key === "Home" || e.key === "0") {
        if (e.key === "0" && (e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        setPlayhead(0);
        setPlaying(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPlaying, splitAtPlayhead, undo, setPlayhead, onExport]);

  return (
    <div className="preview-wrap">
      <div className="preview-stage"><div className="stage-frame" style={vertical ? { aspectRatio: `${size.w} / ${size.h}`, height: "100%", width: "auto", maxWidth: "100%" } : { aspectRatio: `${size.w} / ${size.h}`, width: "100%", height: "auto", maxHeight: "100%" }}>
        <canvas ref={canvasRef} width={size.w} height={size.h} />
        {safeOn && (
          <div className="safe-zone" aria-hidden>
            <i className="safe-top" />
            <i className="safe-bot" />
          </div>
        )}
      </div></div>
      <div className="transport">
        <button className="icon-btn" onClick={undo} title="Undo">
          <IconUndo />
        </button>
        <button className="icon-btn play" onClick={() => setPlaying(!playing)} title="Play">
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button className="icon-btn" onClick={splitAtPlayhead} title="Split">
          <IconSplit />
        </button>
        <div className="tc">
          {fmtTime(playhead)} / {fmtTime(dur)}
        </div>
      </div>
    </div>
  );
}
