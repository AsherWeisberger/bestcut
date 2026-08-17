import { useEffect, useRef } from "react";
import type { Clip, Project } from "../types";
import { clipEnd } from "../types";
import { useEditor } from "../store";
import { isKitPreset } from "./catalog";
import { KitMount } from "./host";
import { registerKitHost } from "./capture";

function visibleKit(project: Project, t: number): Clip[] {
  return project.clips.filter((c) => {
    if (c.type !== "text" || !c.text) return false;
    if (!isKitPreset(c.inPreset || c.preset)) return false;
    return t >= c.start - 1e-4 && t < clipEnd(c) - 1e-6;
  });
}

export function KitLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const project = useEditor((s) => s.project);
  const t = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const clips = visibleKit(project, t);

  useEffect(() => {
    registerKitHost(ref.current);
    return () => registerKitHost(null);
  }, []);

  return (
    <div ref={ref} className="kit-layer" data-kit-layer="1" aria-hidden>
      {clips.map((c) => (
        <div
          key={c.id}
          className="kit-slot"
          style={{
            left: "50%",
            top: `${c.y * 100}%`,
            transform: `translate(-50%, -50%) scale(${c.scale || 1})`,
          }}
        >
          <KitMount clip={c} playing={playing || true} />
        </div>
      ))}
    </div>
  );
}

export { visibleKit };
