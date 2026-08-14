import { useRef, useState } from "react";
import { useEditor } from "../store";
import { splitSentences, srtToClips } from "../engine/captions";
import { clipEnd } from "../types";
import { autoCaption } from "../engine/asr";

export function CaptionPass({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const addCaptions = useEditor((s) => s.addCaptions);
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Bytes stay in this tab.");
  const [busy, setBusy] = useState(false);
  const srtRef = useRef<HTMLInputElement>(null);
  const voice = project.clips.filter((c) => c.role === "voice" || (c.type === "video" && c.role !== "bgm"));
  const span = voice.length
    ? { start: Math.min(...voice.map((c) => c.start)), end: Math.max(...voice.map((c) => clipEnd(c))) }
    : { start: 0, end: Math.max(4, ...project.clips.map(clipEnd)) };

  const distribute = () => {
    const clips = splitSentences(text, span.start, Math.max(1.2, span.end - span.start), "stroke");
    if (!clips.length) return;
    addCaptions(clips);
    onClose();
  };

  const fromVoice = async () => {
    setBusy(true);
    try {
      const r = await autoCaption({
        clipId: voice[0]?.id,
        onProgress: (m, ratio) => {
          setLabel(m);
          if (typeof ratio === "number") setProgress(ratio);
        },
      });
      setLabel(`${r.count} lines · ${r.engine === "whisper" ? "on-device" : "this tab"}`);
      setProgress(1);
      onClose();
    } catch (e) {
      setLabel((e as Error).message || "Could not transcribe.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal sheet-modal" onClick={onClose}>
      <div className="card sheet-card" onClick={(e) => e.stopPropagation()}>
        <h2>Caption pass</h2>
        <p className="hint">Paste a transcript and distribute on the voice clip. Or import SRT. Speech stays in this tab.</p>
        <textarea
          className="pass-ta"
          placeholder="Paste transcript…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="progress">
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="hint">{label}</p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="ghost" onClick={distribute} disabled={!text.trim() || busy}>
            Distribute on the voice clip
          </button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="ghost" onClick={() => srtRef.current?.click()} disabled={busy}>
            Import SRT
          </button>
          <button className="ghost" onClick={fromVoice} disabled={busy}>
            {busy ? "Working…" : "From voice clip"}
          </button>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <input
          ref={srtRef}
          className="sr"
          type="file"
          accept=".srt,.vtt,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            addCaptions(srtToClips(await f.text()));
            onClose();
          }}
        />
      </div>
    </div>
  );
}
