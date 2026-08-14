import { useRef, useState } from "react";
import { useEditor } from "../store";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";
import { ExportSheet } from "./ExportSheet";

function Mark() {
  return (
    <a className="mark" href="./" aria-label="BestCut">
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
        <rect x="5" y="7" width="22" height="18" rx="2" stroke="#D9CCAC" strokeWidth="1.6" />
        <path d="M13 12.2v7.6L20.4 16 13 12.2z" fill="#D9CCAC" />
      </svg>
      <span className="word">
        Best<i>Cut</i>
      </span>
    </a>
  );
}

export function Editor() {
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const selectedId = useEditor((s) => s.selectedId);
  const setAspect = useEditor((s) => s.setAspect);
  const importFiles = useEditor((s) => s.importFiles);
  const addText = useEditor((s) => s.addText);
  const addCaption = useEditor((s) => s.addCaption);
  const addShape = useEditor((s) => s.addShape);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const isPhone = typeof window !== "undefined" && window.matchMedia("(max-width: 959px)").matches;

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ project, assets: Object.values(assets) }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bestcut-project.json";
    a.click();
  };

  return (
    <div className="app">
      <header className="topbar">
        <Mark />
        <div className="top-spacer" />
        <div className="seg" role="tablist" aria-label="Aspect">
          {(["9:16", "1:1", "16:9"] as const).map((a) => (
            <button key={a} className={project.aspect === a ? "on" : ""} onClick={() => setAspect(a)}>
              {a}
            </button>
          ))}
        </div>
        <button className="ghost desk-only" onClick={downloadJson} title="Download project JSON">
          JSON
        </button>
        <button className="cta" onClick={() => setExportOpen(true)}>
          Export
        </button>
      </header>
      <div className="stage">
        <aside className="bin">
          <div className="pane-h">Bin</div>
          <div className="bin-list">
            <button className="ghost" onClick={() => fileRef.current?.click()}>
              Import
            </button>
            {Object.values(assets).map((a) => (
              <div key={a.id} className="asset">
                <div>
                  <b>{a.name}</b>
                  <span>
                    {a.kind} · {a.duration.toFixed(1)}s
                  </span>
                </div>
              </div>
            ))}
          </div>
        </aside>
        <Preview />
        <Inspector />
        <Timeline />
      </div>
      <nav className="dock">
        <div className="dock-in">
          <button onClick={() => fileRef.current?.click()}>
            <span>+</span>Import
          </button>
          <button onClick={() => addText("pop")}>
            <span>Aa</span>Title
          </button>
          <button onClick={() => addCaption()}>
            <span>CC</span>Caption
          </button>
          <button onClick={() => addShape("star")}>
            <span>◇</span>Sticker
          </button>
          <button className={sheet ? "on" : ""} onClick={() => setSheet((v) => !v)}>
            <span>☰</span>Edit
          </button>
        </div>
      </nav>
      {sheet && isPhone && <Inspector embedded />}
      {selectedId && isPhone && !sheet && <Inspector embedded />}
      {exportOpen && <ExportSheet onClose={() => setExportOpen(false)} />}
      <input
        ref={fileRef}
        className="sr"
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        onChange={(e) => e.target.files && importFiles([...e.target.files])}
      />
    </div>
  );
}
