import { useEffect, useState } from "react";
import { useEditor } from "../store";
import { exportProject, probeCodecs, type CodecSupport, type ExportFormat } from "../engine/export";

export function ExportSheet({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const [support, setSupport] = useState<CodecSupport | null>(null);
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const abort = useState(() => new AbortController())[0];

  useEffect(() => {
    probeCodecs().then((s) => {
      setSupport(s);
      if (!s.mp4 && s.webm) setFormat("webm");
      if (!s.mp4 && !s.webm && s.mediaRecorderWebm) setFormat("webm");
    });
  }, []);

  const go = async () => {
    setBusy(true);
    try {
      const blob = await exportProject(project, {
        format,
        signal: abort.signal,
        onProgress: (p, l) => {
          setProgress(p);
          setLabel(l);
        },
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project.name.replace(/\s+/g, "-") || "bestcut"}.${format === "mp4" ? "mp4" : "webm"}`;
      a.click();
      setLabel("Saved — play it back locally.");
      setProgress(1);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setLabel((e as Error).message || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>
        <p className="hint">Same compositor as the preview. No watermark. 1080p 30fps. Chrome/Edge first.</p>
        <div className="codec">
          <span className={`pill ${support?.avc ? "ok" : "no"}`}>H.264 {support?.avc ? "yes" : "no"}</span>
          <span className={`pill ${support?.aac ? "ok" : "no"}`}>AAC {support?.aac ? "yes" : "no"}</span>
          <span className={`pill ${support?.vp9 || support?.vp8 ? "ok" : "no"}`}>VP8/9 {support?.vp9 || support?.vp8 ? "yes" : "no"}</span>
          <span className={`pill ${support?.opus ? "ok" : "no"}`}>Opus {support?.opus ? "yes" : "no"}</span>
        </div>
        <div className="seg">
          <button className={format === "mp4" ? "on" : ""} onClick={() => setFormat("mp4")} disabled={busy}>
            MP4
          </button>
          <button className={format === "webm" ? "on" : ""} onClick={() => setFormat("webm")} disabled={busy}>
            WebM
          </button>
        </div>
        <div className="progress">
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="hint">{label}</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="ghost" onClick={() => { abort.abort(); onClose(); }}>
            {busy ? "Cancel" : "Close"}
          </button>
          <button className="cta" onClick={go} disabled={busy || !support}>
            {busy ? "Encoding…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
