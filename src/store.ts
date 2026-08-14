import { create } from "zustand";
import {
  blankClip,
  clipEnd,
  emptyProject,
  projectDuration,
  uid,
  type Aspect,
  type AssetMeta,
  type Clip,
  type Project,
  type ShapeKind,
  type TextPreset,
  type TransitionKind,
} from "./types";
import { persistAsset, persistProject } from "./db";
import { ingestFile, media } from "./engine/media";

const SNAP = 0.12;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function snapTime(t: number, others: number[], on: boolean) {
  if (!on) return Math.max(0, t);
  let best = Math.max(0, t);
  let d = SNAP;
  for (const o of others) {
    const dd = Math.abs(o - t);
    if (dd < d) {
      d = dd;
      best = o;
    }
  }
  return best;
}

function others(p: Project, except?: string) {
  const pts = [0];
  for (const c of p.clips) {
    if (c.id === except) continue;
    pts.push(c.start, clipEnd(c));
  }
  return pts;
}

type Editor = {
  project: Project;
  assets: Record<string, AssetMeta>;
  playhead: number;
  playing: boolean;
  selectedId: string | null;
  zoom: number;
  snap: boolean;
  hydrating: boolean;
  past: Project[];
  future: Project[];
  toast: string | null;
  push: () => void;
  undo: () => void;
  redo: () => void;
  setPlayhead: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setZoom: (z: number) => void;
  setAspect: (a: Aspect) => void;
  select: (id: string | null) => void;
  importFiles: (files: File[]) => Promise<void>;
  addText: (preset?: TextPreset) => void;
  addCaption: (text?: string) => void;
  addShape: (shape?: ShapeKind) => void;
  addCaptions: (clips: Clip[]) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  moveClip: (id: string, start: number) => void;
  trimClip: (id: string, edge: "in" | "out", t: number) => void;
  splitAtPlayhead: () => void;
  deleteSelected: (ripple?: boolean) => void;
  setTransition: (kind: TransitionKind) => void;
  hydrate: (p: Project, assets: AssetMeta[]) => void;
  setToast: (t: string | null) => void;
};

let persistTimer: number | undefined;
function schedulePersist(p: Project) {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => persistProject(p), 400);
}

export const useEditor = create<Editor>((set, get) => ({
  project: emptyProject(),
  assets: {},
  playhead: 0,
  playing: false,
  selectedId: null,
  zoom: 80,
  snap: true,
  hydrating: true,
  past: [],
  future: [],
  toast: null,

  push() {
    const { project, past } = get();
    set({ past: [...past.slice(-40), clone(project)], future: [] });
  },
  undo() {
    const { past, project, future } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({
      project: prev,
      past: past.slice(0, -1),
      future: [clone(project), ...future],
      playing: false,
    });
    schedulePersist(prev);
  },
  redo() {
    const { future, project, past } = get();
    const next = future[0];
    if (!next) return;
    set({
      project: next,
      future: future.slice(1),
      past: [...past, clone(project)],
      playing: false,
    });
    schedulePersist(next);
  },
  setPlayhead(t) {
    const d = projectDuration(get().project);
    set({ playhead: Math.max(0, Math.min(t, d + 0.05)) });
  },
  setPlaying(v) {
    set({ playing: v });
  },
  setZoom(z) {
    set({ zoom: Math.max(28, Math.min(240, z)) });
  },
  setAspect(a) {
    get().push();
    const project = { ...get().project, aspect: a };
    set({ project });
    schedulePersist(project);
  },
  select(id) {
    set({ selectedId: id });
  },

  async importFiles(files) {
    get().push();
    const project = clone(get().project);
    const assets = { ...get().assets };
    let tVideo = Math.max(0, ...project.clips.filter((c) => c.trackId === "trk_v1").map(clipEnd));
    let tAudio = Math.max(0, ...project.clips.filter((c) => c.trackId === "trk_a1").map(clipEnd));
    let tOv = Math.max(0, ...project.clips.filter((c) => c.trackId === "trk_ov").map(clipEnd));
    for (const file of files) {
      try {
        const meta = await ingestFile(file);
        assets[meta.id] = meta;
        await persistAsset({ id: meta.id, kind: meta.kind, name: meta.name, mime: meta.mime, duration: meta.duration, width: meta.width, height: meta.height, hasAudio: meta.hasAudio }, file);
        if (meta.kind === "audio") {
          project.clips.push(
            blankClip({
              trackId: "trk_a1",
              type: "audio",
              assetId: meta.id,
              start: tAudio,
              duration: meta.duration || 4,
              sourceDuration: meta.duration || 4,
              role: "bgm",
              volume: 0.7,
              fadeIn: 0.4,
              fadeOut: 0.6,
            }),
          );
          tAudio += meta.duration || 4;
        } else if (meta.kind === "image") {
          const lastImg = project.clips.filter((c) => c.trackId === "trk_v1").sort((a, b) => b.start - a.start)[0];
          project.clips.push(
            blankClip({
              trackId: "trk_v1",
              type: "image",
              assetId: meta.id,
              start: tVideo,
              transitionIn: lastImg ? "dissolve" : "cut",
              duration: 3.2,
              sourceDuration: 3.2,
            }),
          );
          tVideo += 3.2;
        } else {
          const last = project.clips.filter((c) => c.trackId === "trk_v1").sort((a, b) => b.start - a.start)[0];
          project.clips.push(
            blankClip({
              trackId: "trk_v1",
              type: "video",
              assetId: meta.id,
              start: tVideo,
              duration: meta.duration || 2,
              sourceDuration: meta.duration || 2,
              role: "voice",
              transitionIn: last ? "dissolve" : "cut",
              fadeIn: 0,
              fadeOut: 0,
            }),
          );
          tVideo += meta.duration || 2;
        }
      } catch (e) {
        set({ toast: `Could not import ${file.name}` });
        console.error(e);
      }
    }
    set({ project, assets, hydrating: false });
    schedulePersist(project);
  },

  addText(preset = "slide-up") {
    get().push();
    const { project, playhead } = get();
    const clip = blankClip({
      trackId: "trk_ov",
      type: "text",
      start: playhead,
      duration: 2.8,
      text: "BESTCUT",
      preset,
      y: 0.38,
      fontSize: 92,
    });
    const next = { ...project, clips: [...project.clips, clip] };
    set({ project: next, selectedId: clip.id });
    schedulePersist(next);
  },
  addCaption(text = "Add a caption") {
    get().push();
    const { project, playhead } = get();
    const clip = blankClip({
      trackId: "trk_cc",
      type: "caption",
      start: playhead,
      duration: 2.2,
      text,
    });
    const next = { ...project, clips: [...project.clips, clip] };
    set({ project: next, selectedId: clip.id });
    schedulePersist(next);
  },
  addShape(shape = "rect") {
    get().push();
    const { project, playhead } = get();
    const clip = blankClip({
      trackId: "trk_ov",
      type: "shape",
      start: playhead,
      duration: 2.4,
      shape,
      y: 0.22,
      scale: 0.7,
    });
    const next = { ...project, clips: [...project.clips, clip] };
    set({ project: next, selectedId: clip.id });
    schedulePersist(next);
  },
  addCaptions(clips) {
    get().push();
    const project = { ...get().project, clips: [...get().project.clips, ...clips] };
    set({ project, selectedId: clips[0]?.id ?? get().selectedId });
    schedulePersist(project);
  },
  updateClip(id, patch) {
    get().push();
    const project = {
      ...get().project,
      clips: get().project.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    };
    set({ project });
    schedulePersist(project);
  },
  moveClip(id, start) {
    const { project, snap } = get();
    const c = project.clips.find((x) => x.id === id);
    if (!c) return;
    const t = snapTime(start, others(project, id), snap);
    const next = {
      ...project,
      clips: project.clips.map((x) => (x.id === id ? { ...x, start: Math.max(0, t) } : x)),
    };
    set({ project: next });
    schedulePersist(next);
  },
  trimClip(id, edge, t) {
    const { project, snap } = get();
    const c = project.clips.find((x) => x.id === id);
    if (!c) return;
    const st = snapTime(t, others(project, id), snap);
    let nextC = { ...c };
    if (edge === "in") {
      const newStart = Math.max(0, Math.min(st, clipEnd(c) - 0.12));
      const delta = newStart - c.start;
      nextC.start = newStart;
      nextC.trimIn = Math.max(0, c.trimIn + delta);
      nextC.duration = Math.max(0.12, c.duration - delta);
    } else {
      nextC.duration = Math.max(0.12, st - c.start);
      if (c.sourceDuration) nextC.duration = Math.min(nextC.duration, c.sourceDuration - c.trimIn);
    }
    const next = { ...project, clips: project.clips.map((x) => (x.id === id ? nextC : x)) };
    set({ project: next });
    schedulePersist(next);
  },
  splitAtPlayhead() {
    const { project, playhead } = get();
    const hit = project.clips.find((c) => playhead > c.start + 0.08 && playhead < clipEnd(c) - 0.08);
    if (!hit) return;
    get().push();
    const lt = playhead - hit.start;
    const left = { ...hit, duration: lt };
    const right = {
      ...hit,
      id: uid("cl"),
      start: playhead,
      duration: hit.duration - lt,
      trimIn: hit.trimIn + lt,
    };
    const next = {
      ...project,
      clips: project.clips.flatMap((c) => (c.id === hit.id ? [left, right] : [c])),
    };
    set({ project: next, selectedId: right.id });
    schedulePersist(next);
  },
  deleteSelected(ripple = false) {
    const { project, selectedId } = get();
    if (!selectedId) return;
    const clip = project.clips.find((c) => c.id === selectedId);
    if (!clip) return;
    get().push();
    let clips = project.clips.filter((c) => c.id !== selectedId);
    if (ripple) {
      clips = clips.map((c) =>
        c.trackId === clip.trackId && c.start >= clipEnd(clip)
          ? { ...c, start: Math.max(0, c.start - clip.duration) }
          : c,
      );
    }
    const next = { ...project, clips };
    set({ project: next, selectedId: null });
    schedulePersist(next);
  },
  setTransition(kind) {
    const { selectedId } = get();
    if (!selectedId) return;
    get().updateClip(selectedId, { transitionIn: kind });
  },
  hydrate(p, assets) {
    const map: Record<string, AssetMeta> = {};
    for (const a of assets) map[a.id] = a;
    set({ project: p, assets: map, hydrating: false });
  },
  setToast(t) {
    set({ toast: t });
    if (t) window.setTimeout(() => {
      if (get().toast === t) set({ toast: null });
    }, 3200);
  },
}));

export { media };
