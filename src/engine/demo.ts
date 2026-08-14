import { useEditor } from "../store";

function png(color: string, label: string): Promise<File> {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 1920);
  g.addColorStop(0, color);
  g.addColorStop(1, "#0D0F14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = "#D9CCAC";
  ctx.font = "500 64px Fraunces, Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(label, 540, 980);
  return new Promise((res) =>
    c.toBlob((b) => res(new File([b!], `${label}.png`, { type: "image/png" })), "image/png"),
  );
}

export async function seedProof() {
  const a = await png("#2a261e", "CLIP 01");
  const b = await png("#1c242c", "CLIP 02");
  const ed = useEditor.getState();
  await ed.importFiles([a, b]);
  ed.setPlayhead(0.2);
  ed.addText("stamp");
  const title = useEditor.getState().project.clips.find((c) => c.type === "text");
  if (title) ed.updateClip(title.id, { text: "Cut in the tab.", fontSize: 88, y: 0.36, inPreset: "stamp", preset: "stamp" });
  ed.setPlayhead(1.15);
  ed.addCaption("Bytes never leave this browser.");
  const caps = useEditor.getState().project.clips.filter((c) => c.type === "caption");
  if (caps[0]) ed.updateClip(caps[0].id, { captionStyle: "stroke", y: 0.72 });
  ed.setPlayhead(3.5);
  ed.addCaption("Split the miss. Title it. Export 9:16.");
  const caps2 = useEditor.getState().project.clips.filter((c) => c.type === "caption");
  const last = caps2[caps2.length - 1];
  if (last) ed.updateClip(last.id, { captionStyle: "stroke", y: 0.72 });
  ed.setBinTab("media");
  const phone = typeof window !== "undefined" && window.innerWidth < 960;
  if (phone) {
    const first = useEditor.getState().project.clips.find((c) => c.trackId === "trk_v1");
    if (first) ed.select(first.id);
  } else {
    const cap = useEditor.getState().project.clips.find((c) => c.type === "caption");
    if (cap) ed.select(cap.id);
  }
  ed.setPlayhead(1.35);
  ed.setPlaying(false);
}

export async function seedSpeedProof() {
  const a = await png("#2a261e", "CLIP 01");
  const b = await png("#1c242c", "CLIP 02");
  const ed = useEditor.getState();
  await ed.importFiles([a, b]);
  const first = useEditor.getState().project.clips.find((c) => c.trackId === "trk_v1");
  if (!first) return;
  ed.updateClip(first.id, { type: "video", duration: 8, sourceDuration: 8 });
  const packed = useEditor.getState().project.clips.find((c) => c.id === first.id);
  if (!packed) return;
  ed.select(packed.id);
  ed.setSpeedMarks(packed.start + 2.15, packed.start + 5.35);
  ed.applyRangeSpeed(4);
  const mid = useEditor
    .getState()
    .project.clips.filter((c) => c.trackId === "trk_v1")
    .sort((a, b) => a.start - b.start)
    .find((c) => (c.speed || 1) !== 1);
  if (mid) ed.select(mid.id);
  ed.setPlayhead(mid ? mid.start + mid.duration * 0.4 : 2.4);
  ed.setPlaying(false);
  ed.setBinTab("media");
  ed.fitZoom(980);
}
