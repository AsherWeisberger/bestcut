export type Aspect = "9:16" | "1:1" | "16:9";
export type TrackKind = "video" | "overlay" | "audio" | "captions";
export type ClipType = "video" | "image" | "audio" | "text" | "caption" | "shape";
export type TextPreset = "fade" | "slide-up" | "pop" | "type-on";
export type TransitionKind = "cut" | "fade" | "dissolve";
export type ShapeKind = "rect" | "ellipse" | "star";
export type AssetKind = "video" | "audio" | "image";

export const ASPECT_SIZE: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

export const FPS = 30;
export const TRANSITION_FRAMES = 8;

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  name: string;
  mime: string;
  duration: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

export interface Clip {
  id: string;
  trackId: string;
  assetId?: string;
  type: ClipType;
  start: number;
  duration: number;
  trimIn: number;
  sourceDuration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  transitionIn: TransitionKind;
  transitionFrames: number;
  text: string;
  preset: TextPreset;
  fontSize: number;
  color: string;
  shape: ShapeKind;
  fill: string;
  x: number;
  y: number;
  scale: number;
  role: "voice" | "bgm" | "none";
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
}

export interface Project {
  id: string;
  name: string;
  aspect: Aspect;
  fps: number;
  tracks: Track[];
  clips: Clip[];
}

export function clipEnd(c: Clip): number {
  return c.start + c.duration;
}

export function projectDuration(p: Project): number {
  let m = 4;
  for (const c of p.clips) m = Math.max(m, clipEnd(c));
  return m;
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function defaultTracks(): Track[] {
  return [
    { id: "trk_v1", kind: "video", name: "Video", muted: false },
    { id: "trk_ov", kind: "overlay", name: "Overlay", muted: false },
    { id: "trk_a1", kind: "audio", name: "Audio", muted: false },
    { id: "trk_cc", kind: "captions", name: "Captions", muted: false },
  ];
}

export function emptyProject(): Project {
  return {
    id: uid("prj"),
    name: "Untitled cut",
    aspect: "9:16",
    fps: FPS,
    tracks: defaultTracks(),
    clips: [],
  };
}

export function blankClip(partial: Partial<Clip> & Pick<Clip, "trackId" | "type">): Clip {
  return {
    id: uid("cl"),
    assetId: undefined,
    start: 0,
    duration: 3,
    trimIn: 0,
    sourceDuration: 3,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transitionIn: "cut",
    transitionFrames: TRANSITION_FRAMES,
    text: "",
    preset: "fade",
    fontSize: 72,
    color: "#F0EFEC",
    shape: "rect",
    fill: "#D9CCAC",
    x: 0.5,
    y: 0.5,
    scale: 1,
    role: "none",
    ...partial,
  };
}
