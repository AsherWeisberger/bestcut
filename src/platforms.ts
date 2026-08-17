import type { Aspect, Project } from "./types";

export type PlatformId = "tiktok" | "youtube" | "instagram" | "facebook" | "linkedin";

export type PlatformFormat = {
  id: string;
  name: string;
  aspect: Aspect;
};

export type SafeArea = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type PlatformSpec = {
  id: PlatformId;
  name: string;
  hint: string;
  formats: PlatformFormat[];
  defaultFormat: string;
  safe: Record<string, SafeArea>;
};

const SAFE_STORY: SafeArea = { top: 0.08, bottom: 0.18, left: 0.045, right: 0.045 };
const SAFE_WIDE: SafeArea = { top: 0.06, bottom: 0.1, left: 0.04, right: 0.04 };
const SAFE_SQUARE: SafeArea = { top: 0.06, bottom: 0.08, left: 0.06, right: 0.06 };
const SAFE_FEED: SafeArea = { top: 0.06, bottom: 0.1, left: 0.05, right: 0.05 };

export const PLATFORMS: PlatformSpec[] = [
  {
    id: "tiktok",
    name: "TikTok",
    hint: "9:16 · highlight 21 to 30 seconds",
    formats: [{ id: "vertical", name: "9:16", aspect: "9:16" }],
    defaultFormat: "vertical",
    safe: { vertical: SAFE_STORY },
  },
  {
    id: "youtube",
    name: "YouTube",
    hint: "Short 9:16 or Long 16:9",
    formats: [
      { id: "short", name: "Short", aspect: "9:16" },
      { id: "long", name: "Long", aspect: "16:9" },
    ],
    defaultFormat: "short",
    safe: { short: SAFE_STORY, long: SAFE_WIDE },
  },
  {
    id: "instagram",
    name: "Instagram",
    hint: "Reels 9:16 or Feed 4:5",
    formats: [
      { id: "reels", name: "Reels", aspect: "9:16" },
      { id: "feed", name: "Feed", aspect: "4:5" },
    ],
    defaultFormat: "reels",
    safe: { reels: SAFE_STORY, feed: SAFE_FEED },
  },
  {
    id: "facebook",
    name: "Facebook",
    hint: "1:1 or 16:9",
    formats: [
      { id: "square", name: "1:1", aspect: "1:1" },
      { id: "wide", name: "16:9", aspect: "16:9" },
    ],
    defaultFormat: "square",
    safe: { square: SAFE_SQUARE, wide: SAFE_WIDE },
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    hint: "Video 16:9 or Still 1:1",
    formats: [
      { id: "video", name: "Video", aspect: "16:9" },
      { id: "still", name: "Still", aspect: "1:1" },
    ],
    defaultFormat: "video",
    safe: { video: SAFE_WIDE, still: SAFE_SQUARE },
  },
];

export function platformById(id: PlatformId | string | undefined): PlatformSpec {
  return PLATFORMS.find((p) => p.id === id) || PLATFORMS[0];
}

export function formatOf(spec: PlatformSpec, formatId?: string): PlatformFormat {
  return spec.formats.find((f) => f.id === formatId) || spec.formats.find((f) => f.id === spec.defaultFormat) || spec.formats[0];
}

export function inferPlatform(aspect: Aspect): { platform: PlatformId; formatId: string } {
  if (aspect === "16:9") return { platform: "youtube", formatId: "long" };
  if (aspect === "1:1") return { platform: "facebook", formatId: "square" };
  if (aspect === "4:5") return { platform: "instagram", formatId: "feed" };
  return { platform: "tiktok", formatId: "vertical" };
}

export function resolvePlatform(p: Pick<Project, "aspect" | "platform" | "formatId">): {
  spec: PlatformSpec;
  format: PlatformFormat;
  safe: SafeArea;
} {
  const spec = p.platform ? platformById(p.platform) : platformById(inferPlatform(p.aspect).platform);
  const format = formatOf(spec, p.formatId);
  const safe = spec.safe[format.id] || SAFE_STORY;
  return { spec, format, safe };
}

export function exportLabel(p: Pick<Project, "aspect" | "platform" | "formatId" | "name">): string {
  const { spec, format } = resolvePlatform(p);
  const bits = [spec.name];
  if (spec.formats.length > 1) bits.push(format.name);
  return bits.join(" ");
}

export function exportFileBase(p: Pick<Project, "name" | "aspect" | "platform" | "formatId">): string {
  const { spec, format } = resolvePlatform(p);
  const name = (p.name || "BestCut").replace(/[<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim() || "BestCut";
  const plat = spec.formats.length > 1 ? `${spec.name} ${format.name}` : spec.name;
  return `${name} ${plat}`;
}
