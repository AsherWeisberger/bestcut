import { useEffect } from "react";
import { emptyProject, type AssetMeta } from "./types";
import { useEditor } from "./store";
import { ingestFile } from "./engine/media";
import { loadAllAssets, loadProject, type AssetRow } from "./db";
import { EmptyState } from "./ui/EmptyState";
import { Editor } from "./ui/Editor";

export function App() {
  const hydrating = useEditor((s) => s.hydrating);
  const project = useEditor((s) => s.project);
  const toast = useEditor((s) => s.toast);
  const hydrate = useEditor((s) => s.hydrate);
  const setDebug = useEditor((s) => s.setDebug);

  useEffect(() => {
    let alive = true;
    const deadline = Date.now() + 14000;
    (async () => {
      try {
        const saved = await Promise.race([
          loadProject(),
          new Promise<null>((r) => window.setTimeout(() => r(null), 4000)),
        ]);
        const rows = await Promise.race([
          loadAllAssets(),
          new Promise<AssetRow[]>((r) => window.setTimeout(() => r([]), 4000)),
        ]);
        const metas: AssetMeta[] = [];
        for (const row of rows) {
          if (!alive || Date.now() > deadline) break;
          const file = new File([row.blob], row.name, { type: row.mime });
          try {
            const loaded = await Promise.race([
              ingestFile(file, row.id),
              new Promise<never>((_, rej) => window.setTimeout(() => rej(new Error("asset timeout")), 9000)),
            ]);
            metas.push(loaded);
          } catch {
            metas.push(row);
          }
        }
        if (!alive) return;
        if (location.search.includes("debug=1")) setDebug(true);
        hydrate(saved || emptyProject(), metas);
        if (location.search.includes("proof")) {
          const { seedProof, seedSpeedProof } = await import("./engine/demo");
          if (/proof=speed/.test(location.search)) await seedSpeedProof();
          else if (!(saved && saved.clips.length)) await seedProof();
        }
      } catch {
        if (alive) hydrate(emptyProject(), []);
      }
    })();
    return () => {
      alive = false;
    };
  }, [hydrate]);

  if (hydrating) {
    return (
      <div className="empty">
        <div className="kicker">BestCut</div>
      </div>
    );
  }

  return (
    <>
      {project.clips.length === 0 ? <EmptyState /> : <Editor />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
