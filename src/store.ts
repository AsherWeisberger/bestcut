import { create } from "zustand";
import {
  blankClip,
  clipEnd,
  clipSpeed,
  emptyProject,
  nextTransition,
  projectDuration,
  uid,
  type Aspect,
  type AssetMeta,
  type BinTab,
  type CaptionStyle,
  type Clip,
  type Project,
  type ShapeKind,
  type TextPreset,
  type TransitionKind,
} from "./types";
import { formatOf, platformById, type PlatformId } from "./platforms";
import { persistAsset, persistProject } from "./db";
import { ingestFile, media } from "./engine/media";
import { rangeSpeedPieces, replaceClipWithPieces, setClipSpeedResult } from "./engine/speed";
import { snapTime } from "./engine/snap";
import { catForPreset } from "./engine/overlays";

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function others(p: Project, except?: string) {
  const pts = [0];
  for (const c of p.clips) {
    if (c.id === except) continue;
    pts.push(c.start, clipEnd(c));
  }
  return pts;
}

function packTrack(clips: Clip[], trackId: string): Clip[] {
  const mine = clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  let t = 0;
  const starts = new Map<string, number>();
  for (const c of mine) {
    starts.set(c.id, t);
    t += c.duration;
  }
  return clips.map((c) => (starts.has(c.id) ? { ...c, start: starts.get(c.id)! } : c));
}

function maybePack(project: Project, trackId: string): Clip[] {
  if (project.magnetic !== false && trackId === "trk_v1") return packTrack(project.clips, "trk_v1");
  return project.clips;
}

type Editor = {
  project: Project;
  assets: Record<string, AssetMeta>;
  playhead: number;
  playing: boolean;
  selectedId: string | null;
  zoom: number;
  snap: boolean;
  ripple: boolean;
  hydrating: boolean;
  past: Project[];
  future: Project[];
  toast: string | null;
  snapGuide: number | null;
  debug: boolean;
  binTab: BinTab;
  speedMarkIn: number | null;
  speedMarkOut: number | null;
  push: () => void;
  undo: () => void;
  redo: () => void;
  setPlayhead: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setZoom: (z: number) => void;
  fitZoom: (lanePx: number) => void;
  setAspect: (a: Aspect) => void;
  setPlatform: (platform: PlatformId, formatId?: string) => void;
  select: (id: string | null) => void;
  setSnap: (v: boolean) => void;
  setRipple: (v: boolean) => void;
  setMagnetic: (v: boolean) => void;
  setBinTab: (t: BinTab) => void;
  setDebug: (v: boolean) => void;
  setSnapGuide: (t: number | null) => void;
  importFiles: (files: File[]) => Promise<void>;
  dropAsset: (assetId: string, trackId: string, time: number) => void;
  addText: (preset?: TextPreset) => void;
  addCaption: (text?: string) => void;
  addShape: (shape?: ShapeKind) => void;
  addCaptions: (clips: Clip[]) => void;
  replaceCaptions: (ranges: { start: number; end: number }[], clips: Clip[]) => void;
  styleAllCaptions: (style: CaptionStyle) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  moveClip: (id: string, start: number, meta?: { origin?: number; playhead?: number; prev?: number }) => void;
  trimClip: (id: string, edge: "in" | "out", t: number, meta?: { origin?: number; playhead?: number; prev?: number }) => void;
  finishEdit: () => void;
  splitAtPlayhead: () => void;
  deleteSelected: (ripple?: boolean) => void;
  duplicateSelected: () => void;
  setTransition: (kind: TransitionKind, clipId?: string) => void;
  cycleTransition: (clipId: string) => void;
  hydrate: (p: Project, assets: AssetMeta[]) => void;
  setToast: (t: string | null) => void;
  mergeCaptionWithNext: () => void;
  splitCaptionAt: (index: number) => void;
  markSpeedIn: () => void;
  markSpeedOut: () => void;
  clearSpeedMarks: () => void;
  setSpeedMarks: (a: number | null, b: number | null) => void;
  setClipSpeed: (id: string, speed: number) => void;
  applyRangeSpeed: (speed: number, clipId?: string) => void;
};

let persistTimer: number | undefined;
function schedulePersist(p: Project) {
  if (typeof window === "undefined") return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => persistProject(p), 400);
}

type HeadFn = (t: number) => void;
const headFns = new Set<HeadFn>();
export function watchPlayhead(fn: HeadFn) {
  headFns.add(fn);
  fn(useEditor.getState().playhead);
  return () => {
    headFns.delete(fn);
  };
}
export function emitPlayhead(t: number) {
  for (const fn of headFns) {
    try {
      fn(t);
    } catch {
      /* listener must not break playback */
    }
  }
}

let coalesceUntil = 0;
let coalesceId = "";

export const useEditor = create<Editor>((set, get) => ({
  project: emptyProject(),
  assets: {},
  playhead: 0,
  playing: false,
  selectedId: null,
  zoom: 80,
  snap: true,
  ripple: false,
  hydrating: true,
  past: [],
  future: [],
  toast: null,
  snapGuide: null,
  debug: typeof window !== "undefined" && /(?:\?|&)debug=1/.test(window.location.search),
  binTab: "fx",
  speedMarkIn: null,
  speedMarkOut: null,

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
    const next = Math.max(0, Math.min(t, d + 0.05));
    if (Math.abs(next - get().playhead) > 1e-4) set({ playhead: next });
    emitPlayhead(next);
  },
  setPlaying(v) {
    set({ playing: v });
  },
  setZoom(z) {
    set({ zoom: Math.max(28, Math.min(240, z)) });
  },
  fitZoom(lanePx) {
    const d = projectDuration(get().project) + 1;
    const z = Math.max(28, Math.min(240, lanePx / Math.max(1, d)));
    set({ zoom: z });
  },
  setAspect(a) {
    get().push();
    const project = { ...get().project, aspect: a };
    set({ project });
    schedulePersist(project);
  },
  setPlatform(platform, formatId) {
    get().push();
    const spec = platformById(platform);
    const fmt = formatOf(spec, formatId || spec.defaultFormat);
    const project = { ...get().project, platform, formatId: fmt.id, aspect: fmt.aspect };
    set({ project });
    schedulePersist(project);
  },
  select(id) {
    const clear = id !== get().selectedId;
    set({
      selectedId: id,
      ...(clear ? { speedMarkIn: null, speedMarkOut: null } : {}),
    });
  },
  setSnap(v) {
    set({ snap: v });
  },
  setRipple(v) {
    set({ ripple: v });
  },
  setMagnetic(v) {
    get().push();
    const project = { ...get().project, magnetic: v };
    set({ project });
    schedulePersist(project);
  },
  setBinTab(t) {
    set({ binTab: t });
  },
  setDebug(v) {
    set({ debug: v });
  },
  setSnapGuide(t) {
    set({ snapGuide: t });
  },

  async importFiles(files) {
    if (!files.length) return;
    get().push();
    const project = clone(get().project);
    const assets = { ...get().assets };
    let tVideo = Math.max(0, ...project.clips.filter((c) => c.trackId === "trk_v1").map(clipEnd), 0);
    let tAudio = Math.max(0, ...project.clips.filter((c) => c.trackId === "trk_a1").map(clipEnd), 0);
    for (const file of files) {
      try {
        const meta = await ingestFile(file);
        assets[meta.id] = meta;
        await persistAsset(
          {
            id: meta.id,
            kind: meta.kind,
            name: meta.name,
            mime: meta.mime,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            hasAudio: meta.hasAudio,
          },
          file,
        );
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
        get().setToast("Could not read that file in this browser.");
        console.error(e);
      }
    }
    if (project.magnetic !== false) project.clips = packTrack(project.clips, "trk_v1");
    set({ project, assets, hydrating: false });
    schedulePersist(project);
  },

  dropAsset(assetId, trackId, time) {
    const meta = get().assets[assetId];
    if (!meta) return;
    get().push();
    const project = clone(get().project);
    const mag = project.magnetic !== false;
    const { t } = snapTime(time, others(project), get().snap || mag, {
      zoom: get().zoom,
      mag,
    });
    let clip: Clip;
    if (meta.kind === "audio") {
      clip = blankClip({
        trackId: trackId === "trk_a1" ? "trk_a1" : "trk_a1",
        type: "audio",
        assetId,
        start: t,
        duration: meta.duration || 4,
        sourceDuration: meta.duration || 4,
        role: "bgm",
        volume: 0.7,
      });
    } else if (meta.kind === "image") {
      const onOv = trackId === "trk_ov";
      clip = blankClip({
        trackId: onOv ? "trk_ov" : "trk_v1",
        type: "image",
        assetId,
        start: t,
        duration: 3.2,
        sourceDuration: 3.2,
        y: onOv ? 0.5 : 0.5,
        scale: onOv ? 0.85 : 1,
      });
    } else {
      clip = blankClip({
        trackId: trackId === "trk_ov" ? "trk_ov" : "trk_v1",
        type: "video",
        assetId,
        start: t,
        duration: meta.duration || 2,
        sourceDuration: meta.duration || 2,
        role: "voice",
      });
    }
    project.clips.push(clip);
    set({ project, selectedId: clip.id, snapGuide: null });
    schedulePersist(project);
  },

  addText(preset = "scramble") {
    get().push();
    const { project, playhead } = get();
    const cat = catForPreset(preset);
    const y = cat === "stickers" ? 0.78 : cat === "gallery" ? 0.5 : 0.38;
    const fontSize = cat === "stickers" ? 48 : cat === "gallery" ? 64 : 92;
    const clip = blankClip({
      trackId: "trk_ov",
      type: "text",
      start: playhead,
      duration: 2.8,
      text: "BESTCUT",
      preset,
      inPreset: preset,
      y,
      fontSize,
      textFace: "fraunces",
    });
    const next = { ...project, clips: [...project.clips, clip] };
    set({ project: next, selectedId: clip.id, playhead, playing: true });
    window.setTimeout(() => useEditor.getState().setPlaying(false), 1200);
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
      captionStyle: "stroke",
      y: 0.72,
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
    const styled = clips.map((c) => ({
      ...c,
      captionStyle: c.captionStyle || "stroke",
      y: c.y || 0.72,
      captionGroup: true,
    }));
    const project = { ...get().project, clips: [...get().project.clips, ...styled] };
    set({ project, selectedId: styled[0]?.id ?? get().selectedId });
    schedulePersist(project);
  },
  replaceCaptions(ranges, clips) {
    get().push();
    const keep = get().project.clips.filter((c) => {
      if (c.type !== "caption") return true;
      return !ranges.some((r) => c.start < r.end && clipEnd(c) > r.start);
    });
    const styled = clips.map((c) => ({
      ...c,
      captionStyle: c.captionStyle || "stroke",
      y: c.y || 0.72,
      captionGroup: true,
    }));
    const project = { ...get().project, clips: [...keep, ...styled] };
    set({ project, selectedId: styled[0]?.id ?? null });
    schedulePersist(project);
  },
  styleAllCaptions(style) {
    get().push();
    const project = {
      ...get().project,
      clips: get().project.clips.map((c) =>
        c.type === "caption" && c.captionGroup !== false ? { ...c, captionStyle: style } : c,
      ),
    };
    set({ project });
    schedulePersist(project);
  },
  updateClip(id, patch) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (id !== coalesceId || now > coalesceUntil) get().push();
    coalesceId = id;
    coalesceUntil = now + 450;
    const project = {
      ...get().project,
      clips: get().project.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    };
    set({ project });
    schedulePersist(project);
  },
  moveClip(id, start, meta) {
    const { project, snap, zoom } = get();
    const c = project.clips.find((x) => x.id === id);
    if (!c) return;
    const mag = project.magnetic !== false;
    const pts = others(project, id);
    pts.push(meta?.playhead ?? get().playhead);
    const { t, hit } = snapTime(start, pts, snap || mag, {
      zoom,
      mag,
      origin: meta?.origin ?? c.start,
      prev: meta?.prev,
    });
    const clips = project.clips.map((x) => (x.id === id ? { ...x, start: Math.max(0, t) } : x));
    set({ project: { ...project, clips }, snapGuide: hit });
  },
  trimClip(id, edge, t, meta) {
    const { project, snap, ripple, zoom } = get();
    const c = project.clips.find((x) => x.id === id);
    if (!c) return;
    const mag = project.magnetic !== false;
    const pts = others(project, id);
    pts.push(meta?.playhead ?? get().playhead);
    const origin = meta?.origin ?? (edge === "in" ? c.start : c.start + c.duration);
    const { t: st, hit } = snapTime(t, pts, snap || mag, { zoom, mag, origin, prev: meta?.prev });
    let nextC = { ...c };
    const spd = clipSpeed(c);
    if (edge === "in") {
      const newStart = Math.max(0, Math.min(st, clipEnd(c) - 0.12));
      const delta = newStart - c.start;
      const newTrim = Math.max(0, c.trimIn + delta * spd);
      if (c.sourceDuration && newTrim >= c.sourceDuration - 0.12) return;
      nextC.start = newStart;
      nextC.trimIn = newTrim;
      nextC.duration = Math.max(0.12, c.duration - delta);
    } else {
      nextC.duration = Math.max(0.12, st - c.start);
      if (c.sourceDuration) nextC.duration = Math.min(nextC.duration, (c.sourceDuration - c.trimIn) / spd);
    }
    let clips = project.clips.map((x) => (x.id === id ? nextC : x));
    if (ripple || (project.magnetic !== false && c.trackId === "trk_v1")) {
      if (edge === "in" && ripple && c.trackId !== "trk_v1") {
        const delta = nextC.start - c.start;
        clips = clips.map((x) =>
          x.trackId === c.trackId && x.id !== id && x.start >= c.start ? { ...x, start: Math.max(0, x.start + delta) } : x,
        );
      }
    }
    set({
      project: { ...project, clips },
      snapGuide: hit,
      playhead: edge === "in" ? nextC.start : nextC.start + nextC.duration,
      playing: false,
    });
  },
  finishEdit() {
    set({ snapGuide: null });
    schedulePersist(get().project);
  },
  splitAtPlayhead() {
    const { project, playhead, selectedId } = get();
    const hits = project.clips.filter((c) => playhead > c.start + 0.08 && playhead < clipEnd(c) - 0.08);
    if (!hits.length) return;
    const selected = hits.find((c) => c.id === selectedId);
    const targets = selected ? [selected] : hits;
    get().push();
    let clips = project.clips;
    let selectId = selectedId;
    for (const hit of targets) {
      const lt = playhead - hit.start;
      const spd = clipSpeed(hit);
      const left = { ...hit, duration: lt };
      const right = {
        ...hit,
        id: uid("cl"),
        start: playhead,
        duration: hit.duration - lt,
        trimIn: hit.trimIn + lt * spd,
        transitionIn: "cut" as TransitionKind,
      };
      clips = clips.flatMap((c) => (c.id === hit.id ? [left, right] : [c]));
      selectId = right.id;
    }
    const next = { ...project, clips };
    set({ project: next, selectedId: selectId });
    schedulePersist(next);
  },
  deleteSelected(rippleArg) {
    const { project, selectedId, ripple } = get();
    if (!selectedId) return;
    const clip = project.clips.find((c) => c.id === selectedId);
    if (!clip) return;
    get().push();
    let clips = project.clips.filter((c) => c.id !== selectedId);
    const doRipple = rippleArg ?? ripple ?? false;
    const magneticVid = project.magnetic !== false && clip.trackId === "trk_v1";
    if (doRipple || magneticVid) {
      clips = clips.map((c) =>
        c.trackId === clip.trackId && c.start >= clipEnd(clip)
          ? { ...c, start: Math.max(0, c.start - clip.duration) }
          : c,
      );
    }
    if (magneticVid) clips = packTrack(clips, "trk_v1");
    const next = { ...project, clips };
    set({ project: next, selectedId: null });
    schedulePersist(next);
  },
  duplicateSelected() {
    const { project, selectedId } = get();
    if (!selectedId) return;
    const clip = project.clips.find((c) => c.id === selectedId);
    if (!clip) return;
    get().push();
    const copy = { ...clone(clip), id: uid("cl"), start: clipEnd(clip) };
    let clips = [...project.clips, copy];
    clips = maybePack({ ...project, clips }, copy.trackId);
    const next = { ...project, clips };
    set({ project: next, selectedId: copy.id });
    schedulePersist(next);
  },
  setTransition(kind, clipId) {
    const id = clipId || get().selectedId;
    if (!id) return;
    get().updateClip(id, { transitionIn: kind });
  },
  cycleTransition(clipId) {
    const c = get().project.clips.find((x) => x.id === clipId);
    if (!c) return;
    get().updateClip(clipId, { transitionIn: nextTransition(c.transitionIn) });
  },
  hydrate(p, assets) {
    const map: Record<string, AssetMeta> = {};
    for (const a of assets) map[a.id] = a;
    const project: Project = {
      ...p,
      magnetic: p.magnetic !== false,
      tracks: p.tracks?.length ? p.tracks : emptyProject().tracks,
      platform: p.platform || (p.aspect === "16:9" ? "youtube" : p.aspect === "1:1" ? "facebook" : p.aspect === "4:5" ? "instagram" : "tiktok"),
      formatId:
        p.formatId ||
        (p.aspect === "16:9" ? "long" : p.aspect === "1:1" ? "square" : p.aspect === "4:5" ? "feed" : "vertical"),
    };
    if (!p.platform && p.aspect === "16:9") {
      project.platform = "youtube";
      project.formatId = "long";
    }
    set({ project, assets: map, hydrating: false });
  },
  setToast(t) {
    set({ toast: t });
    if (t)
      window.setTimeout(() => {
        if (get().toast === t) set({ toast: null });
      }, 3200);
  },
  mergeCaptionWithNext() {
    const { project, selectedId } = get();
    if (!selectedId) return;
    const list = project.clips.filter((c) => c.type === "caption").sort((a, b) => a.start - b.start);
    const i = list.findIndex((c) => c.id === selectedId);
    if (i < 0 || i === list.length - 1) return;
    const a = list[i];
    const b = list[i + 1];
    get().push();
    const merged = {
      ...a,
      text: `${a.text} ${b.text}`.trim(),
      duration: clipEnd(b) - a.start,
    };
    const clips = project.clips.filter((c) => c.id !== b.id).map((c) => (c.id === a.id ? merged : c));
    const next = { ...project, clips };
    set({ project: next });
    schedulePersist(next);
  },
  splitCaptionAt(index) {
    const { project, selectedId } = get();
    if (!selectedId) return;
    const c = project.clips.find((x) => x.id === selectedId);
    if (!c || c.type !== "caption") return;
    const left = c.text.slice(0, index).trim();
    const right = c.text.slice(index).trim();
    if (!left || !right) return;
    get().push();
    const mid = c.start + c.duration * (left.length / c.text.length);
    const a = { ...c, text: left, duration: mid - c.start };
    const b = { ...c, id: uid("cl"), text: right, start: mid, duration: clipEnd(c) - mid };
    const clips = project.clips.flatMap((x) => (x.id === c.id ? [a, b] : [x]));
    const next = { ...project, clips };
    set({ project: next, selectedId: b.id });
    schedulePersist(next);
  },
  markSpeedIn() {
    const { project, selectedId, playhead } = get();
    const clip = project.clips.find((c) => c.id === selectedId);
    if (!clip || (clip.type !== "video" && clip.type !== "audio")) {
      set({ toast: "Select a video or audio clip." });
      return;
    }
    const end = clipEnd(clip);
    if (playhead < clip.start - 0.04 || playhead > end + 0.04) {
      set({ toast: "Park the playhead on this clip." });
      return;
    }
    const t = Math.max(clip.start, Math.min(playhead, end));
    const out = get().speedMarkOut;
    if (out != null && out < t) set({ speedMarkIn: out, speedMarkOut: t });
    else set({ speedMarkIn: t });
  },
  markSpeedOut() {
    const { project, selectedId, playhead } = get();
    const clip = project.clips.find((c) => c.id === selectedId);
    if (!clip || (clip.type !== "video" && clip.type !== "audio")) {
      set({ toast: "Select a video or audio clip." });
      return;
    }
    const end = clipEnd(clip);
    if (playhead < clip.start - 0.04 || playhead > end + 0.04) {
      set({ toast: "Park the playhead on this clip." });
      return;
    }
    const t = Math.max(clip.start, Math.min(playhead, end));
    const inn = get().speedMarkIn;
    if (inn != null && t < inn) set({ speedMarkIn: t, speedMarkOut: inn });
    else set({ speedMarkOut: t });
  },
  clearSpeedMarks() {
    set({ speedMarkIn: null, speedMarkOut: null });
  },
  setSpeedMarks(a, b) {
    if (a == null && b == null) {
      set({ speedMarkIn: null, speedMarkOut: null });
      return;
    }
    if (a != null && b != null && b < a) set({ speedMarkIn: b, speedMarkOut: a });
    else set({ speedMarkIn: a, speedMarkOut: b });
  },
  setClipSpeed(id, speed) {
    const clip = get().project.clips.find((c) => c.id === id);
    if (!clip) return;
    get().push();
    const { next, delta } = setClipSpeedResult(clip, speed);
    const originalEnd = clipEnd(clip);
    let clips = get().project.clips.map((c) => (c.id === id ? next : c));
    clips = clips.map((c) =>
      c.trackId === clip.trackId && c.id !== id && c.start >= originalEnd - 1e-4
        ? { ...c, start: Math.max(0, c.start + delta) }
        : c,
    );
    const project = { ...get().project, clips };
    project.clips = maybePack(project, clip.trackId);
    set({ project, speedMarkIn: null, speedMarkOut: null });
    schedulePersist(project);
  },
  applyRangeSpeed(speed, clipId) {
    const id = clipId || get().selectedId;
    if (!id) return;
    const clip = get().project.clips.find((c) => c.id === id);
    if (!clip || (clip.type !== "video" && clip.type !== "audio")) return;
    const { speedMarkIn, speedMarkOut } = get();
    if (speedMarkIn == null || speedMarkOut == null || Math.abs(speedMarkOut - speedMarkIn) < 0.05) {
      get().setClipSpeed(clip.id, speed);
      return;
    }
    get().push();
    const result = rangeSpeedPieces(clip, speedMarkIn, speedMarkOut, speed);
    let clips = replaceClipWithPieces(get().project.clips, clip, result.pieces, result.delta);
    const project = { ...get().project, clips };
    project.clips = maybePack(project, clip.trackId);
    set({
      project,
      selectedId: result.selectId,
      speedMarkIn: null,
      speedMarkOut: null,
    });
    schedulePersist(project);
  },
}));

export { media };
