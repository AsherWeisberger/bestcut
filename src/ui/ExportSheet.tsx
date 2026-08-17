import { useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { ASPECT_SIZE } from "../types";
import { captionsToSrt } from "../engine/captions";
import { exportProject, probeCodecs, type CodecSupport, type ExportFormat } from "../engine/export";
import { StatusOrb } from "./StatusOrb";

export function ExportSheet({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const debug = useEditor((s) => s.debug);
  const [support, setSupport] = useState<CodecSupport | null>(null);
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const abortRef = useRef(new AbortController());
  const size = ASPECT_SIZE[project.aspect];

  useEffect(() => {
    probeCodecs().then((s) => {
      setSupport(s);
      if (!s.mp4 && s.webm) setFormat("webm");
      if (!s.mp4 && !s.webm && s.mediaRecorderWebm) setFormat("webm");
    });
  }, []);

  const codecLine = () => {
    if (!support) return "";
    if (format === "mp4") return [support.avc ? "H.264" : null, support.aac ? "AAC" : null].filter(Boolean).join(" · ");
    return [support.vp9 ? "VP9" : support.vp8 ? "VP8" : null, support.opus ? "Opus" : null].filter(Boolean).join(" · ");
  };

  const go = async () => {
    abortRef.current = new AbortController();
    setBusy(true);
    setDone(false);
    try {
      const blob = await exportProject(project, {
        format,
        signal: abortRef.current.signal,
        onProgress: (p, l) => {
          setProgress(p);
          setLabel(l);
        },
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      a.download = `${project.name.replace(/\s+/g, "-") || "bestcut"}.${ext}`;
      a.click();
      setLabel("Saved — play it on device.");
      setProgress(1);
      setDone(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setLabel((e as Error).message || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadSrt = () => {
    const srt = captionsToSrt(project.clips);
    if (!srt.trim()) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([srt], { type: "text/plain" }));
    a.download = "bestcut.srt";
    a.click();
  };

  return (
    <div className="modal sheet-modal" onClick={onClose}>
      <div className="card sheet-card" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>
        <p className="lead-line">1080 · 30fps · no watermark · same as preview</p>
        <p className="hint">
          {size.w}×{size.h} from the top bar. Bytes stay here.
        </p>
        <div className="seg">
          <button className={format === "mp4" ? "on" : ""} onClick={() => setFormat("mp4")} disabled={busy}>
            MP4
          </button>
          <button className={format === "webm" ? "on" : ""} onClick={() => setFormat("webm")} disabled={busy}>
            WebM
          </button>
        </div>
        <p className="hint mute-line">{codecLine()}</p>
        {debug && support && (
          <div className="codec">
            <span className={`pill ${support.avc ? "ok" : "no"}`}>H.264 {support.avc ? "yes" : "no"}</span>
            <span className={`pill ${support.aac ? "ok" : "no"}`}>AAC {support.aac ? "yes" : "no"}</span>
            <span className={`pill ${support.vp9 || support.vp8 ? "ok" : "no"}`}>VP8/9 {support.vp9 || support.vp8 ? "yes" : "no"}</span>
            <span className={`pill ${support.opus ? "ok" : "no"}`}>Opus {support.opus ? "yes" : "no"}</span>
          </div>
        )}
        {busy ? (
          <StatusOrb label={label || "Encoding"} state="weaving" tone="dark" />
        ) : (
          <>
            <div className="progress">
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="hint">{label}</p>
          </>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="ghost"
            onClick={() => {
              abortRef.current.abort();
              onClose();
            }}
          >
            {busy ? "Cancel" : "Close"}
          </button>
          <button className="cta" onClick={go} disabled={busy || !support}>
            {busy ? "Encoding…" : done ? "Download again" : "Download"}
          </button>
        </div>
        <button className="ghost ghost-link" onClick={downloadSrt}>
          Download SRT
        </button>
      </div>
    </div>
  );
}
