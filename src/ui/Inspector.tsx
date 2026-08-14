import { useRef } from "react";
import { useEditor } from "../store";
import { srtToClips } from "../engine/captions";
import type { TextPreset, TransitionKind } from "../types";

export function Inspector({ embedded = false }: { embedded?: boolean }) {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const updateClip = useEditor((s) => s.updateClip);
  const addCaptions = useEditor((s) => s.addCaptions);
  const addText = useEditor((s) => s.addText);
  const addCaption = useEditor((s) => s.addCaption);
  const addShape = useEditor((s) => s.addShape);
  const setTransition = useEditor((s) => s.setTransition);
  const srtRef = useRef<HTMLInputElement>(null);
  const clip = project.clips.find((c) => c.id === selectedId);

  const body = (
    <>
      <div className="pane-h">{clip ? clip.type : "Inspector"}</div>
      <div className="body">
        {!clip && (
          <>
            <p className="hint">Select a clip, or add a title, sticker, or caption at the playhead.</p>
            <div className="row">
              <button className="ghost" onClick={() => addText("slide-up")}>Title</button>
              <button className="ghost" onClick={() => addCaption()}>Caption</button>
            </div>
            <div className="row">
              <button className="ghost" onClick={() => addShape("rect")}>Rect</button>
              <button className="ghost" onClick={() => addShape("ellipse")}>Ellipse</button>
              <button className="ghost" onClick={() => addShape("star")}>Star</button>
            </div>
            <button className="ghost" onClick={() => srtRef.current?.click()}>Import SRT</button>
            <input
              ref={srtRef}
              className="sr"
              type="file"
              accept=".srt,.vtt,text/plain"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const text = await f.text();
                addCaptions(srtToClips(text, "trk_cc"));
              }}
            />
          </>
        )}
        {clip && (
          <>
            {(clip.type === "text" || clip.type === "caption") && (
              <div className="field">
                <label>Copy</label>
                <textarea value={clip.text} onChange={(e) => updateClip(clip.id, { text: e.target.value })} />
              </div>
            )}
            {clip.type === "text" && (
              <div className="field">
                <label>Motion</label>
                <select
                  value={clip.preset}
                  onChange={(e) => updateClip(clip.id, { preset: e.target.value as TextPreset })}
                >
                  <option value="fade">Fade</option>
                  <option value="slide-up">Slide up</option>
                  <option value="pop">Pop</option>
                  <option value="type-on">Type on</option>
                </select>
              </div>
            )}
            {(clip.type === "video" || clip.type === "audio") && (
              <>
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
                  <label>Role</label>
                  <select
                    value={clip.role}
                    onChange={(e) => updateClip(clip.id, { role: e.target.value as "voice" | "bgm" | "none" })}
                  >
                    <option value="voice">Voice (ducks music)</option>
                    <option value="bgm">BGM (gets ducked)</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </>
            )}
            {clip.type === "video" && (
              <div className="field">
                <label>Transition in</label>
                <select
                  value={clip.transitionIn}
                  onChange={(e) => setTransition(e.target.value as TransitionKind)}
                >
                  <option value="cut">Cut</option>
                  <option value="fade">Fade</option>
                  <option value="dissolve">Dissolve</option>
                </select>
              </div>
            )}
            {clip.type === "shape" && (
              <div className="field">
                <label>Fill</label>
                <input type="text" value={clip.fill} onChange={(e) => updateClip(clip.id, { fill: e.target.value })} />
              </div>
            )}
            <p className="hint">
              {clip.duration.toFixed(2)}s · start {clip.start.toFixed(2)}s
            </p>
          </>
        )}
      </div>
    </>
  );

  if (embedded) return <div className="sheet">{body}</div>;
  return <aside className="inspector">{body}</aside>;
}
