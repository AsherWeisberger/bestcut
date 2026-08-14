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
  ed.setPlayhead(0.4);
  ed.addText("slide-up");
  const title = useEditor.getState().project.clips.find((c) => c.type === "text");
  if (title) ed.updateClip(title.id, { text: "Cut in the tab.", fontSize: 88, y: 0.36 });
  ed.setPlayhead(1.1);
  ed.addCaption("Bytes never leave this browser.");
  ed.setPlayhead(3.4);
  ed.addCaption("Split the miss. Title it. Export 9:16.");
  ed.setPlayhead(0.8);
  ed.addShape("star");
  ed.setPlayhead(1.2);
  ed.setPlaying(false);
}
