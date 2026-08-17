import { useEffect } from "react";
import { emptyProject, type AssetMeta } from "./types";
import { useEditor } from "./store";
import { ingestFile } from "./engine/media";
import { loadAllAssets, loadProject, type AssetRow } from "./db";
import { EmptyState } from "./ui/EmptyState";
import { Editor } from "./ui/Editor";
import { StatusOrb } from "./ui/StatusOrb";

function afterPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

function BootChrome() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-col">
          <div className="mark">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect x="5" y="7" width="22" height="18" rx="2" stroke="#D9CCAC" strokeWidth="1.6" />
              <path d="M13 12.2v7.6L20.4 16 13 12.2z" fill="#D9CCAC" />
            </svg>
            <span className="word">
              Best<i>Cut</i>
            </span>
          </div>
          <a className="byline" href="https://x.com/AsherWeisberger" rel="noopener noreferrer">
            <span className="who">Made by Asher Weisberger · </span>@AsherWeisberger
          </a>
        </div>
      </header>
      <div className="boot">
        <StatusOrb label="Loading" state="connecting" tone="dark" />
      </div>
    </div>
  );
}

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
      await afterPaint();
      try {
        const saved = await Promise.race([
          loadProject(),
          new Promise<null>((r) => window.setTimeout(() => r(null), 4000)),
        ]);
        await afterPaint();
        const rows = await Promise.race([
          loadAllAssets(),
          new Promise<AssetRow[]>((r) => window.setTimeout(() => r([]), 4000)),
        ]);
        const metas: AssetMeta[] = [];
        for (const row of rows) {
          if (!alive || Date.now() > deadline) break;
          await afterPaint();
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

  if (hydrating) return <BootChrome />;

  return (
    <>
      {project.clips.length === 0 ? <EmptyState /> : <Editor />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
