import { useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";
import { ExportSheet } from "./ExportSheet";
import { CaptionPass } from "./CaptionPass";
import { Bin } from "./Bin";
import {
  IconAa,
  IconCc,
  IconCopy,
  IconDia,
  IconMenu,
  IconMotion,
  IconPlus,
  IconRipple,
  IconSpeed,
  IconSplit,
  IconStyle,
  IconTrash,
  IconVol,
} from "./icons";
import { SPEEDS } from "../types";

function Mark({ onLong }: { onLong: () => void }) {
  const t = useRef<number>(0);
  return (
    <a
      className="mark"
      href="./"
      aria-label="BestCut"
      onPointerDown={() => {
        t.current = window.setTimeout(onLong, 650);
      }}
      onPointerUp={() => window.clearTimeout(t.current)}
      onPointerLeave={() => window.clearTimeout(t.current)}
    >
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

function useMq(q: string) {
  const [m, set] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => set(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [q]);
  return m;
}

export function Editor() {
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const selectedId = useEditor((s) => s.selectedId);
  const debug = useEditor((s) => s.debug);
  const setAspect = useEditor((s) => s.setAspect);
  const importFiles = useEditor((s) => s.importFiles);
  const addText = useEditor((s) => s.addText);
  const splitAtPlayhead = useEditor((s) => s.splitAtPlayhead);
  const deleteSelected = useEditor((s) => s.deleteSelected);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  const updateClip = useEditor((s) => s.updateClip);
  const setRipple = useEditor((s) => s.setRipple);
  const ripple = useEditor((s) => s.ripple);
  const cycleTransition = useEditor((s) => s.cycleTransition);
  const setDebug = useEditor((s) => s.setDebug);
  const setBinTab = useEditor((s) => s.setBinTab);
  const select = useEditor((s) => s.select);
  const dockRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const phone = useMq("(max-width: 959px)");
  const clip = project.clips.find((c) => c.id === selectedId);
  const kind = clip?.type;

  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--dock-offset", el.offsetHeight + "px");
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!phone) return;
    if (kind === "text" || kind === "caption") setSheet(true);
    if (!selectedId) setSheet(false);
  }, [selectedId, kind, phone]);

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ project, assets: Object.values(assets) }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bestcut-project.json";
    a.click();
  };

  const cycleSpeed = () => {
    if (!clip) return;
    const cur = clip.speed || 1;
    const i = SPEEDS.indexOf(cur as (typeof SPEEDS)[number]);
    updateClip(clip.id, { speed: SPEEDS[(i + 1) % SPEEDS.length] });
  };

  const dockNothing = (
    <>
      <button onClick={() => fileRef.current?.click()}>
        <IconPlus />
        Import
      </button>
      <button onClick={() => addText("rise")}>
        <IconAa />
        Title
      </button>
      <button onClick={() => setCaptionOpen(true)}>
        <IconCc />
        Caption
      </button>
      <button
        onClick={() => {
          const v = project.clips.find((c) => c.trackId === "trk_v1" && c.transitionIn !== "cut") || project.clips.find((c) => c.trackId === "trk_v1");
          if (v) cycleTransition(v.id);
          else setBinTab("trans");
        }}
      >
        <IconDia />
        Trans
      </button>
      <button className={sheet ? "on" : ""} onClick={() => setSheet((v) => !v)}>
        <IconMenu />
        Edit
      </button>
    </>
  );

  const dockClip = (
    <>
      <button onClick={splitAtPlayhead}>
        <IconSplit />
        Split
      </button>
      <button onClick={cycleSpeed}>
        <IconSpeed />
        {(clip?.speed || 1) === 1 ? "1×" : `${clip?.speed}×`}
      </button>
      <button onClick={() => setSheet(true)}>
        <IconVol />
        Volume
      </button>
      <button className={ripple ? "on" : ""} onClick={() => setRipple(!ripple)}>
        <IconRipple />
        Ripple
      </button>
      <button onClick={() => deleteSelected()}>
        <IconTrash />
        Delete
      </button>
    </>
  );

  const dockText = (
    <>
      <button onClick={duplicateSelected}>
        <IconCopy />
        Copy
      </button>
      <button onClick={() => setSheet(true)}>
        <IconStyle />
        Style
      </button>
      <button onClick={() => setSheet(true)}>
        <IconMotion />
        Motion
      </button>
      <button onClick={splitAtPlayhead}>
        <IconSplit />
        Split
      </button>
      <button onClick={() => deleteSelected()}>
        <IconTrash />
        Delete
      </button>
    </>
  );

  const showSheet = phone && sheet;
  const mediaClip = kind === "video" || kind === "audio" || kind === "image";

  return (
    <div className="app">
      <header className="topbar">
        <Mark onLong={() => setDebug(true)} />
        <div className="top-spacer" />
        <div className="seg" role="tablist" aria-label="Aspect">
          {(["9:16", "1:1", "16:9"] as const).map((a) => (
            <button key={a} className={project.aspect === a ? "on" : ""} onClick={() => setAspect(a)}>
              {a}
            </button>
          ))}
        </div>
        {debug && (
          <button className="ghost desk-only" onClick={downloadJson} title="Download project JSON">
            JSON
          </button>
        )}
        <button className="cta" onClick={() => setExportOpen(true)}>
          Export
        </button>
      </header>
      <div className="stage">
        <Bin onImport={() => fileRef.current?.click()} onCaptionPass={() => setCaptionOpen(true)} />
        <Preview onExport={() => setExportOpen(true)} />
        <Inspector onCaptionPass={() => setCaptionOpen(true)} />
        <Timeline />
      </div>
      <nav className="dock" ref={dockRef}>
        <div className="dock-in">
          {!clip && dockNothing}
          {clip && mediaClip && dockClip}
          {clip && (kind === "text" || kind === "caption") && dockText}
          {clip && kind === "shape" && dockClip}
        </div>
      </nav>
      {showSheet && (
        <Inspector embedded onCaptionPass={() => setCaptionOpen(true)} onClose={() => { setSheet(false); select(null); }} />
      )}
      {exportOpen && <ExportSheet onClose={() => setExportOpen(false)} />}
      {captionOpen && <CaptionPass onClose={() => setCaptionOpen(false)} />}
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
