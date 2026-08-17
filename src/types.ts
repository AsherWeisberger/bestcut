export type Aspect = "9:16" | "1:1" | "16:9" | "4:5";
export type TrackKind = "video" | "overlay" | "audio" | "captions";
export type ClipType = "video" | "image" | "audio" | "text" | "caption" | "shape";
export type TextPreset = string;
export type OutPreset = "fade" | "sink" | "scale" | "hold";
export type TransitionKind = "cut" | "fade" | "dissolve" | "slide" | "wipe";
export type CaptionStyle = "plate" | "stroke" | "karaoke" | "stack";
export type TextFace = "fraunces" | "sora";
export type ShapeKind = "rect" | "ellipse" | "star";
export type AssetKind = "video" | "audio" | "image";
export type BinTab = "media" | "fx" | "captions" | "trans";

export const ASPECT_SIZE: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

export const FPS = 30;
export const TRANSITION_FRAMES = 8;
export const SNAP = 0.12;
export const TITLE_INS: { id: TextPreset; name: string }[] = [
  { id: "rise", name: "Rise" },
  { id: "bloom", name: "Bloom" },
  { id: "fade", name: "Fade" },
  { id: "type", name: "Type" },
  { id: "stamp", name: "Stamp" },
  { id: "drift", name: "Drift" },
  { id: "split", name: "Split" },
  { id: "hold", name: "Hold" },
];
export const TITLE_OUTS: { id: OutPreset; name: string }[] = [
  { id: "fade", name: "Fade" },
  { id: "sink", name: "Sink" },
  { id: "scale", name: "Scale" },
  { id: "hold", name: "Hold" },
];
export const TRANSITIONS: TransitionKind[] = ["cut", "fade", "dissolve", "slide", "wipe"];
export const SPEEDS = [0.5, 1, 2, 3, 4, 5, 8, 10];
export const CAPTION_STYLES: CaptionStyle[] = ["plate", "stroke", "karaoke", "stack"];

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

export interface CaptionWord {
  t: number;
  w: string;
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
  captionStyle?: CaptionStyle;
  captionWords?: CaptionWord[];
  textFace?: TextFace;
  inPreset?: TextPreset;
  outPreset?: OutPreset;
  inDur?: number;
  outDur?: number;
  speed?: number;
  captionGroup?: boolean;
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
  magnetic?: boolean;
  platform?: "tiktok" | "youtube" | "instagram" | "facebook" | "linkedin";
  formatId?: string;
}

export function clipSpeed(c: { speed?: number }): number {
  return c.speed && c.speed > 0 ? c.speed : 1;
}

export function clipEnd(c: Clip): number {
  return c.start + c.duration;
}

export function sourceSpan(c: Clip): number {
  return Math.max(0, c.duration * clipSpeed(c));
}

export function trimOut(c: Clip): number {
  return c.trimIn + sourceSpan(c);
}

export function fmtSpeed(sp: number): string {
  const n = Number.isInteger(sp) ? String(sp) : String(sp);
  return `${n}×`;
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
    magnetic: true,
    platform: "tiktok",
    formatId: "vertical",
  };
}

export function blankClip(partial: Partial<Clip> & Pick<Clip, "trackId" | "type">): Clip {
  const isCap = partial.type === "caption";
  const isText = partial.type === "text";
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
    preset: isText ? "rise" : "fade",
    fontSize: isText ? 92 : isCap ? 62 : 72,
    color: "#F0EFEC",
    shape: "rect",
    fill: "#D9CCAC",
    x: 0.5,
    y: isCap ? 0.72 : isText ? 0.38 : 0.5,
    scale: 1,
    role: "none",
    captionStyle: isCap ? "stroke" : undefined,
    textFace: isText ? "fraunces" : "sora",
    inPreset: isText ? "rise" : undefined,
    outPreset: isText ? "fade" : undefined,
    inDur: 0.38,
    outDur: 0.28,
    speed: 1,
    captionGroup: true,
    ...partial,
  };
}

const PRESET_ALIAS: Record<string, TextPreset> = {
  "slide-up": "rise",
  pop: "bloom",
  "type-on": "type",
  scramble: "scrambletext",
  morph: "textmorph",
  weight: "weight-hover",
  pixel: "pixelreveal",
  mask: "mask-text-reveal",
  brush: "brush-reveal",
  fadeup: "stagger-text-rise",
  dust: "dust-text-reveal",
  spark: "starburst",
  vapor: "text-vaporize",
  glitchtext: "glitch-text",
  smoky: "smokytext",
  spotlight: "spotlighttext",
  textwave: "text-wave",
  flicker: "flickertext",
  letterswap: "random-letter-swap",
  charwaves: "character-waves",
  spring: "spring-text",
  vaporize: "text-vaporize",
  fluidtext: "fluid-text",
  staggerrise: "stagger-text-rise",
  letterdrop: "letter-drop",
  rolling: "rolling-letters",
  textnoise: "text-noise",
  spiral: "spiral-text",
  letterswing: "letter-swing",
  textwipe: "text-wipe",
  flip: "mechanical-flip",
  appear: "appear-text",
  coloursweep: "text-colour-sweep",
  elastic: "elastic-text",
  falling: "falling-text",
  emerge: "text-emerge",
  typesequence: "type-sequence",
  gradient: "gradient-text",
  unfold: "3d-text-unfold",
  dither: "dither-effect",
  focus: "focus-reveal",
  pixelunfold: "pixel-unfold",
  fluidimage: "fluid-image-reveal",
  imageripple: "image-ripple",
  ascii: "ascii-reveal",
  shine: "shine-card",
  glitter: "glitterwrap",
  tunnel: "particletunnel",
  emoji: "emoji-particle",
  snow: "snowfall",
  glitch: "glitch-text",
  distort: "text-distortion",
  imagestack: "swipe-stack",
  neon: "neon-border",
  pill: "shiny-pill",
};

export function normalizeIn(p?: TextPreset): TextPreset {
  if (!p) return "scrambletext";
  return PRESET_ALIAS[p] || p;
}

export function fmtTime(t: number) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${r.toFixed(2).padStart(5, "0")}`;
}

export function nextTransition(k: TransitionKind): TransitionKind {
  const i = TRANSITIONS.indexOf(k);
  return TRANSITIONS[(i + 1) % TRANSITIONS.length];
}
