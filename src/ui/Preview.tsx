import { useEffect, useRef } from "react";
import { ASPECT_SIZE, clipEnd, clipSpeed, fmtTime, projectDuration, type Project } from "../types";
import { useEditor, watchPlayhead } from "../store";
import { media, sourceTime } from "../engine/media";
import { PreviewAudio } from "../engine/audio";
import { renderFrame, visibleMediaClips, type FrameBank } from "../engine/render";
import { IconPause, IconPlay, IconSplit, IconUndo } from "./icons";

const audio = new PreviewAudio();

function paintCanvas(canvas: HTMLCanvasElement | null, t: number, project: Project) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = ASPECT_SIZE[project.aspect];
  if (canvas.width !== size.w) canvas.width = size.w;
  if (canvas.height !== size.h) canvas.height = size.h;
  const bank: FrameBank = { frames: new Map() };
  const playing = useEditor.getState().playing;
  for (const c of visibleMediaClips(project, t)) {
    if (!c.assetId) continue;
    if (c.type === "image") {
      const img = media.images.get(c.assetId);
      if (img) bank.frames.set(c.id, img);
    } else {
      const v = media.videos.get(c.assetId);
      if (v) {
        if (!playing) {
          const st = sourceTime(c, t);
          if (Math.abs(v.currentTime - st) > 0.04) {
            try {
              v.currentTime = Math.max(0, Math.min(st, (v.duration || st) - 0.001));
            } catch {
              /* */
            }
          }
        }
        bank.frames.set(c.id, v);
      }
    }
  }
  renderFrame(ctx, t, project, bank);
}

function Timecode({ duration }: { duration: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    return watchPlayhead((t) => {
      const el = ref.current;
      if (el) el.textContent = `${fmtTime(t)} / ${fmtTime(duration)}`;
    });
  }, [duration]);
  return (
    <div className="tc" ref={ref}>
      {fmtTime(0)} / {fmtTime(duration)}
    </div>
  );
}

export function Preview({ onExport }: { onExport?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = useEditor((s) => s.project);
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

  useEffect(() => {
    if (useEditor.getState().playing) return;
    paintCanvas(canvasRef.current, useEditor.getState().playhead, project);
  }, [project, size.w, size.h]);

  useEffect(() => {
    if (playing) return;
    return watchPlayhead((t) => {
      if (useEditor.getState().playing) return;
      paintCanvas(canvasRef.current, t, useEditor.getState().project);
    });
  }, [playing]);

  useEffect(() => {
    if (!playing) {
      audio.stop();
      for (const v of media.videos.values()) v.pause();
      return;
    }
    let raf = 0;
    let last = performance.now();
    let t = useEditor.getState().playhead;
    const startProject = useEditor.getState().project;
    audio.play(startProject, t, projectDuration(startProject)).catch(() => {});
    const syncVideos = (proj: Project, at: number) => {
      const covering = new Map<string, Project["clips"][number]>();
      for (const c of proj.clips) {
        if (c.type !== "video" || !c.assetId) continue;
        if (at >= c.start - 1e-4 && at < clipEnd(c) - 1e-6) covering.set(c.assetId, c);
      }
      for (const [id, v] of media.videos) {
        const c = covering.get(id);
        if (!c) {
          if (!v.paused) v.pause();
          continue;
        }
        const spd = clipSpeed(c);
        const st = sourceTime(c, at);
        v.muted = true;
        try {
          const rate = Math.min(16, Math.max(0.0625, spd));
          if (Math.abs(v.playbackRate - rate) > 0.001) v.playbackRate = rate;
        } catch {
          /* */
        }
        if (Math.abs(v.currentTime - st) > Math.max(0.12, 0.04 * spd)) {
          try {
            v.currentTime = Math.max(0, Math.min(st, (v.duration || st) - 0.001));
          } catch {
            /* */
          }
        }
        if (v.paused) v.play().catch(() => {});
      }
    };
    syncVideos(startProject, t);
    const loop = (now: number) => {
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      t += dt;
      const ed = useEditor.getState();
      const proj = ed.project;
      const end = projectDuration(proj);
      if (t >= end) {
        t = end;
        ed.setPlayhead(t);
        ed.setPlaying(false);
        paintCanvas(canvasRef.current, t, proj);
        return;
      }
      syncVideos(proj, t);
      ed.setPlayhead(t);
      paintCanvas(canvasRef.current, t, proj);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      useEditor.getState().setPlayhead(t);
    };
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
      if (e.key === "s" || e.key === "S") {
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
      if (e.key === "Delete" || e.key === "Backspace" || e.key === "Del" || e.code === "Delete") {
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
      <div className="preview-stage">
        <div
          className="stage-frame"
          style={
            vertical
              ? { aspectRatio: `${size.w} / ${size.h}`, height: "100%", width: "auto", maxWidth: "100%" }
              : { aspectRatio: `${size.w} / ${size.h}`, width: "100%", height: "auto", maxHeight: "100%" }
          }
        >
          <canvas ref={canvasRef} width={size.w} height={size.h} />
          {safeOn && (
            <div className="safe-zone" aria-hidden>
              <i className="safe-top" />
              <i className="safe-bot" />
            </div>
          )}
        </div>
      </div>
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
        <Timecode duration={dur} />
      </div>
    </div>
  );
}
