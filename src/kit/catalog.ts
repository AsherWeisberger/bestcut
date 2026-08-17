import raw from "../kit-catalog.json";
import type { TextPreset } from "../types";

export type KitCategory =
  | "text"
  | "image"
  | "animation"
  | "background-animation"
  | "image-gallery"
  | "interactive-elements"
  | "button"
  | "border"
  | "cursor";

export type KitItem = {
  id: string;
  name: string;
  category: KitCategory;
  description: string;
  deps: string[];
  moduleUrl: string;
  posterUrl: string;
  skip: boolean;
  skipReason: string | null;
};

export const KIT_ALL = raw as KitItem[];
export const KIT = KIT_ALL.filter((k) => !k.skip && k.moduleUrl);

export const KIT_BY_ID = new Map(KIT_ALL.map((k) => [k.id, k]));

export function kitOf(id?: string) {
  if (!id) return undefined;
  return KIT_BY_ID.get(id);
}

export function isKitPreset(p?: TextPreset): boolean {
  if (!p) return false;
  const hit = KIT_BY_ID.get(p);
  return !!(hit && !hit.skip && hit.moduleUrl);
}
