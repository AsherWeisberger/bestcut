import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditor } from "../store";
import { srtToClips } from "../engine/captions";
import {
  CAPTION_STYLES,
  SPEEDS,
  TITLE_OUTS,
  TRANSITIONS,
  clipSpeed,
  fmtSpeed,
  fmtTime,
  type CaptionStyle,
  type OutPreset,
  type TextFace,
  type TextPreset,
  type TransitionKind,
} from "../types";
import { OVERLAY_CATS, catForPreset, type OverlayCat } from "../engine/overlays";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sec">
      <div className="pane-h tight">{title}</div>
      {children}
    </div>
  );
}

function Chips<T extends string>({
  value,
  opts,
  onChange,
}: {
  value: T;
  opts: { id: T; name: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="chip-row">
      {opts.map((o) => (
        <button key={o.id} className={value === o.id ? "chip on" : "chip"} onClick={() => onChange(o.id)}>
          {o.name}
        </button>
      ))}
    </div>
  );
}

export function Inspector({
  embedded = false,
  onCaptionPass,
  onClose,
}: {
  embedded?: boolean;
  onCaptionPass?: () => void;
  onClose?: () => void;
}) {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const speedMarkIn = useEditor((s) => s.speedMarkIn);
  const speedMarkOut = useEditor((s) => s.speedMarkOut);
  const updateClip = useEditor((s) => s.updateClip);
  const setClipSpeed = useEditor((s) => s.setClipSpeed);
  const applyRangeSpeed = useEditor((s) => s.applyRangeSpeed);
  const markSpeedIn = useEditor((s) => s.markSpeedIn);
  const markSpeedOut = useEditor((s) => s.markSpeedOut);
  const clearSpeedMarks = useEditor((s) => s.clearSpeedMarks);
  const addCaptions = useEditor((s) => s.addCaptions);
  const addText = useEditor((s) => s.addText);
  const addCaption = useEditor((s) => s.addCaption);
  const styleAllCaptions = useEditor((s) => s.styleAllCaptions);
  const setTransition = useEditor((s) => s.setTransition);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const setPlaying = useEditor((s) => s.setPlaying);
  const select = useEditor((s) => s.select);
  const mergeCaptionWithNext = useEditor((s) => s.mergeCaptionWithNext);
  const splitCaptionAt = useEditor((s) => s.splitCaptionAt);
  const srtRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const clip = project.clips.find((c) => c.id === selectedId);
  const captions = project.clips.filter((c) => c.type === "caption").sort((a, b) => a.start - b.start);
  const [overlayCat, setOverlayCat] = useState<OverlayCat | null>(null);
  const derivedCat = clip?.type === "text" ? catForPreset(clip.inPreset || clip.preset) : "kinetic";
  const catId = overlayCat ?? derivedCat;
  const header = clip ? clip.type.toUpperCase() : "INSPECTOR";

  useEffect(() => {
    setOverlayCat(null);
  }, [selectedId]);

  const pulseTitle = (id: string, start: number) => {
    setPlayhead(start);
    setPlaying(true);
    window.setTimeout(() => {
      const ed = useEditor.getState();
      if (ed.selectedId === id) ed.setPlaying(false);
    }, 1200);
  };

  const body = (
    <>
      <div className="pane-h">{header}</div>
      <div className="body">
        {!clip && (
          <>
            <p className="hint">Pick an effect from the FX bin. It lands on Overlay and paints on the preview.</p>
            <div className="row">
              <button className="ghost" onClick={() => addText("scramble")}>
                Scramble
              </button>
              <button className="ghost" onClick={() => (onCaptionPass ? onCaptionPass() : addCaption())}>
                Caption pass
              </button>
            </div>
            <button className="ghost" onClick={() => srtRef.current?.click()}>
              Import SRT
            </button>
            <input
              ref={srtRef}
              className="sr"
              type="file"
              accept=".srt,.vtt,text/plain"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                addCaptions(srtToClips(await f.text()));
              }}
            />
            {captions.length > 0 && (
              <Section title="Transcript">
                <div className="transcript">
                  {captions.map((c) => (
                    <button
                      key={c.id}
                      className="tr-line"
                      onClick={() => {
                        select(c.id);
                        setPlayhead(c.start);
                      }}
                    >
                      {c.text}
                    </button>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
        {clip && (
          <>
            {(clip.type === "text" || clip.type === "caption") && (
              <div className="field">
                <label>Copy</label>
                <textarea
                  ref={taRef}
                  value={clip.text}
                  onChange={(e) => updateClip(clip.id, { text: e.target.value })}
                />
              </div>
            )}

            {clip.type === "caption" && (
              <>
                <Section title="Look">
                  <div className="style-grid">
                    {CAPTION_STYLES.map((st) => (
                      <button
                        key={st}
                        className={clip.captionStyle === st ? "style-tile on" : "style-tile"}
                        onClick={() => updateClip(clip.id, { captionStyle: st })}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                  {clip.captionGroup === false && <p className="hint">This line only</p>}
                  <div className="row">
                    <button className="ghost" onClick={() => styleAllCaptions((clip.captionStyle || "stroke") as CaptionStyle)}>
                      Style all
                    </button>
                    <button className="ghost" onClick={mergeCaptionWithNext}>
                      Merge next
                    </button>
                  </div>
                  <button
                    className="ghost"
                    onClick={() => {
                      const el = taRef.current;
                      if (!el) return;
                      splitCaptionAt(el.selectionStart || Math.floor(clip.text.length / 2));
                    }}
                  >
                    Split at caret
                  </button>
                </Section>
                <Section title="Transcript">
                  <div className="transcript">
                    {captions.map((c) => (
                      <button
                        key={c.id}
                        className={`tr-line ${c.id === clip.id ? "on" : ""}`}
                        onClick={() => {
                          select(c.id);
                          setPlayhead(c.start);
                        }}
                      >
                        {c.text}
                      </button>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {clip.type === "text" && (
              <>
                <Section title="Look">
                  <div className="field">
                    <label>Face</label>
                    <div className="seg">
                      {(["fraunces", "sora"] as TextFace[]).map((f) => (
                        <button
                          key={f}
                          className={clip.textFace === f ? "on" : ""}
                          onClick={() => updateClip(clip.id, { textFace: f })}
                        >
                          {f === "fraunces" ? "Fraunces" : "Sora"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label>Size {clip.fontSize}</label>
                    <input
                      type="range"
                      min={48}
                      max={160}
                      step={1}
                      value={clip.fontSize}
                      onChange={(e) => updateClip(clip.id, { fontSize: +e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Color</label>
                    <div className="chip-row">
                      {[
                        ["#F0EFEC", "Paper"],
                        ["#D9CCAC", "Sand"],
                        ["#0D0F14", "Ink"],
                      ].map(([hex, name]) => (
                        <button
                          key={hex}
                          className={clip.color.toLowerCase() === hex.toLowerCase() ? "swatch on" : "swatch"}
                          style={{ background: hex }}
                          title={name}
                          onClick={() => updateClip(clip.id, { color: hex })}
                        />
                      ))}
                      <input
                        className="hex"
                        value={clip.color}
                        onChange={(e) => updateClip(clip.id, { color: e.target.value })}
                      />
                    </div>
                  </div>
                </Section>
                <Section title="Motion">
                  <div className="cat-rail" role="tablist" aria-label="Overlay look">
                    {OVERLAY_CATS.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        className={(catId === cat.id ? "on" : "")}
                        onClick={() => setOverlayCat(cat.id)}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                  <label className="micro">In</label>
                  <div className="style-grid tight">
                    {(OVERLAY_CATS.find((c) => c.id === catId) || OVERLAY_CATS[0]).items.map((p) => (
                      <button
                        key={p.id}
                        className={(clip.inPreset || clip.preset) === p.id ? "style-tile on" : "style-tile"}
                        onClick={() => {
                          updateClip(clip.id, { inPreset: p.id as TextPreset, preset: p.id as TextPreset });
                          setOverlayCat(catForPreset(p.id));
                          pulseTitle(clip.id, clip.start);
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <div className="field">
                    <label>In {(clip.inDur ?? 0.38).toFixed(2)}s</label>
                    <input
                      type="range"
                      min={0.12}
                      max={0.8}
                      step={0.02}
                      value={clip.inDur ?? 0.38}
                      onChange={(e) => updateClip(clip.id, { inDur: +e.target.value })}
                    />
                  </div>
                  <label className="micro">Out</label>
                  <Chips
                    value={(clip.outPreset || "fade") as OutPreset}
                    opts={TITLE_OUTS}
                    onChange={(v) => updateClip(clip.id, { outPreset: v })}
                  />
                  <div className="field">
                    <label>Out {(clip.outDur ?? 0.28).toFixed(2)}s</label>
                    <input
                      type="range"
                      min={0.12}
                      max={0.8}
                      step={0.02}
                      value={clip.outDur ?? 0.28}
                      onChange={(e) => updateClip(clip.id, { outDur: +e.target.value })}
                    />
                  </div>
                </Section>
                <Section title="Timing">
                  <div className="row">
                    <div className="field">
                      <label>X {clip.x.toFixed(2)}</label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={clip.x}
                        onChange={(e) => updateClip(clip.id, { x: +e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Y {clip.y.toFixed(2)}</label>
                      <input
                        type="range"
                        min={0.08}
                        max={0.82}
                        step={0.01}
                        value={clip.y}
                        onChange={(e) => updateClip(clip.id, { y: +e.target.value })}
                      />
                    </div>
                  </div>
                </Section>
              </>
            )}

            {(clip.type === "video" || clip.type === "audio" || clip.type === "image") && (
              <>
                <Section title="Timing">
                  <p className="hint">
                    {clip.duration.toFixed(2)}s on the timeline
                    {clip.type !== "image" ? ` · ${fmtSpeed(clipSpeed(clip))}` : ""}
                  </p>
                  {clip.type !== "image" && (
                    <div className="field">
                      <label>
                        {speedMarkIn != null && speedMarkOut != null ? "Range speed" : "Speed"}
                      </label>
                      <div className="chip-row speed">
                        {SPEEDS.map((sp) => (
                          <button
                            key={sp}
                            className={clipSpeed(clip) === sp ? "chip on" : "chip"}
                            onClick={() => {
                              if (speedMarkIn != null && speedMarkOut != null) applyRangeSpeed(sp);
                              else setClipSpeed(clip.id, sp);
                            }}
                          >
                            {fmtSpeed(sp)}
                          </button>
                        ))}
                      </div>
                      <label>Range</label>
                      <div className="row">
                        <button
                          className={speedMarkIn != null ? "ghost on" : "ghost"}
                          onClick={markSpeedIn}
                        >
                          In
                        </button>
                        <button
                          className={speedMarkOut != null ? "ghost on" : "ghost"}
                          onClick={markSpeedOut}
                        >
                          Out
                        </button>
                        <button
                          className="ghost"
                          disabled={speedMarkIn == null && speedMarkOut == null}
                          onClick={clearSpeedMarks}
                        >
                          Clear
                        </button>
                      </div>
                      <p className="hint">Speed just this stretch.</p>
                      {(speedMarkIn != null || speedMarkOut != null) && (
                        <p className="hint">
                          {speedMarkIn != null ? fmtTime(speedMarkIn) : "In —"}
                          {" – "}
                          {speedMarkOut != null ? fmtTime(speedMarkOut) : "Out —"}
                          {speedMarkIn != null && speedMarkOut != null
                            ? ` · then tap a speed`
                            : " · park playhead, tap In then Out"}
                        </p>
                      )}
                    </div>
                  )}
                </Section>
                {clip.type === "video" && (
                  <Section title="Look">
                    <div className="field">
                      <label>Transition in</label>
                      <div className="chip-row">
                        {TRANSITIONS.map((k) => (
                          <button
                            key={k}
                            className={clip.transitionIn === k ? "chip on" : "chip"}
                            onClick={() => setTransition(k as TransitionKind)}
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <label>Frames {clip.transitionFrames || 8}</label>
                      <input
                        type="range"
                        min={4}
                        max={16}
                        step={1}
                        value={clip.transitionFrames || 8}
                        onChange={(e) => updateClip(clip.id, { transitionFrames: +e.target.value })}
                      />
                    </div>
                  </Section>
                )}
                {clip.type !== "image" && (
                  <Section title="Audio">
                    <div className="field">
                      <label>Volume {Math.round(clip.volume * 100)}%</label>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.01}
                        value={clip.volume}
                        onChange={(e) => updateClip(clip.id, { volume: +e.target.value })}
                      />
                    </div>
                    <div className="row">
                      <div className="field">
                        <label>Fade in</label>
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.05}
                          value={clip.fadeIn}
                          onChange={(e) => updateClip(clip.id, { fadeIn: +e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Fade out</label>
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.05}
                          value={clip.fadeOut}
                          onChange={(e) => updateClip(clip.id, { fadeOut: +e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>Ducking</label>
                      <div className="seg">
                        <button className={clip.role === "voice" ? "on" : ""} onClick={() => updateClip(clip.id, { role: "voice" })}>
                          Voice
                        </button>
                        <button className={clip.role === "bgm" ? "on" : ""} onClick={() => updateClip(clip.id, { role: "bgm" })}>
                          Music
                        </button>
                        <button className={clip.role === "none" ? "on" : ""} onClick={() => updateClip(clip.id, { role: "none" })}>
                          Off
                        </button>
                      </div>
                    </div>
                    <p className="hint">Voice ducks music when both play.</p>
                  </Section>
                )}
              </>
            )}

            {clip.type === "shape" && (
              <div className="field">
                <label>Fill</label>
                <input type="text" value={clip.fill} onChange={(e) => updateClip(clip.id, { fill: e.target.value })} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  if (embedded)
    return (
      <div className="sheet">
        <div className="sheet-handle" onClick={onClose} />
        {body}
      </div>
    );
  return <aside className="inspector">{body}</aside>;
}
