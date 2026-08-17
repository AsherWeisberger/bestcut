import { beforeEach, describe, expect, test } from "bun:test";
import { blankClip, emptyProject } from "../types";
import { useEditor } from "../store";

describe("moveClip to timeline start", () => {
  beforeEach(() => {
    const p = emptyProject();
    p.magnetic = true;
    p.clips = [
      blankClip({
        id: "c1",
        trackId: "trk_v1",
        type: "video",
        start: 75,
        duration: 8,
        sourceDuration: 8,
      }),
    ];
    useEditor.setState({
      project: p,
      snap: true,
      playhead: 75,
      zoom: 80,
      hydrating: false,
      snapGuide: null,
    });
  });

  test("QA: clip at 75s drags to 0 with Mag and Snap on", () => {
    const ed = useEditor.getState();
    ed.moveClip("c1", 0, { origin: 75, playhead: 75 });
    ed.finishEdit();
    expect(useEditor.getState().project.clips[0].start).toBe(0);
  });

  test("leaving the playhead does not snap the clip back to 75", () => {
    const ed = useEditor.getState();
    ed.moveClip("c1", 74.6, { origin: 75, playhead: 75 });
    expect(useEditor.getState().project.clips[0].start).toBeCloseTo(74.6, 5);
  });
});
