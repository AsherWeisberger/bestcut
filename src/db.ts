import Dexie, { type EntityTable } from "dexie";
import type { AssetMeta, Project } from "./types";

export type AssetRow = AssetMeta & { blob: Blob };
export type KvRow = { key: string; value: unknown };

class BestCutDB extends Dexie {
  assets!: EntityTable<AssetRow, "id">;
  kv!: EntityTable<KvRow, "key">;
  constructor() {
    super("bestcut");
    this.version(1).stores({
      assets: "id, kind, name",
      kv: "key",
    });
  }
}

export const db = new BestCutDB();

export async function persistProject(project: Project) {
  await db.kv.put({ key: "project", value: project });
}

export async function loadProject(): Promise<Project | null> {
  const row = await db.kv.get("project");
  return (row?.value as Project) || null;
}

export async function persistAsset(meta: AssetMeta, blob: Blob) {
  await db.assets.put({ ...meta, blob });
}

export async function loadAllAssets(): Promise<AssetRow[]> {
  return db.assets.toArray();
}

export async function deleteAsset(id: string) {
  await db.assets.delete(id);
}

export async function clearAll() {
  await db.assets.clear();
  await db.kv.clear();
}
