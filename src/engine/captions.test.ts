import { describe, expect, test } from "bun:test";
import { captionsToSrt, parseSrt, splitSentences, srtToClips } from "./captions";

const srt = `1
00:00:00,000 --> 00:00:01,200
Hello there

2
00:00:01,200 --> 00:00:02,800
Bytes stay in this tab.
`;

describe("srt", () => {
  test("parses blocks into start/end/text", () => {
    const rows = parseSrt(srt);
    expect(rows).toHaveLength(2);
    expect(rows[0].text).toBe("Hello there");
    expect(rows[0].start).toBeCloseTo(0, 5);
    expect(rows[1].start).toBeCloseTo(1.2, 5);
    expect(rows[1].end).toBeCloseTo(2.8, 5);
  });

  test("srtToClips lands on the caption track", () => {
    const clips = srtToClips(srt);
    expect(clips.every((c) => c.trackId === "trk_cc" && c.type === "caption")).toBe(true);
    expect(clips[0].captionStyle).toBe("stroke");
  });

  test("round-trip captionsToSrt keeps copy", () => {
    const clips = srtToClips(srt);
    const out = captionsToSrt(clips);
    expect(out).toContain("Hello there");
    expect(out).toContain("Bytes stay in this tab.");
  });
});

describe("manual transcript", () => {
  test("splitSentences distributes onto the voice span", () => {
    const clips = splitSentences("One. Two three.", 0, 4, "plate");
    expect(clips.length).toBeGreaterThanOrEqual(2);
    expect(clips[0].captionStyle).toBe("plate");
    const span = clips[clips.length - 1].start + clips[clips.length - 1].duration;
    expect(span).toBeGreaterThan(3);
  });
});
