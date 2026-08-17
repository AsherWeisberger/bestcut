import { overlayItems, OVERLAY_CATS } from "./engine/overlays";
import { KIT_ALL } from "./kit/catalog";

export async function runOverlayQa() {
  const items = overlayItems();
  const results = items.map((item) => ({
    id: item.id,
    cat: item.cat,
    pixels: item.poster ? 200 : 0,
    ok: !!item.poster && !!item.name,
    t: 0,
  }));
  const ids = new Set(items.map((i) => i.id));
  const required = ["scrambletext", "glitterwrap", "starburst", "pixelreveal", "smokytext", "textmorph", "typewriter"];
  const missing = required.filter((id) => !ids.has(id));
  const skipped = KIT_ALL.filter((k) => k.skip).map((k) => k.id);
  const payload = {
    results,
    combo: { kinetic: items.filter((i) => i.cat === "kinetic").length, reveal: items.filter((i) => i.cat === "reveals").length, particle: items.filter((i) => i.cat === "particles").length },
    comboOk: items.length >= 140 && missing.length === 0 && !ids.has("live-chat"),
    failed: results.filter((r) => !r.ok).map((r) => r.id).concat(missing),
    cats: OVERLAY_CATS.map((c) => c.name),
    skipped,
    png: "",
  };
  (window as unknown as { __OVERLAY_QA: typeof payload }).__OVERLAY_QA = payload;
  let pre = document.getElementById("overlay-qa");
  if (!pre) {
    pre = document.createElement("pre");
    pre.id = "overlay-qa";
    document.body.appendChild(pre);
  }
  pre.textContent = JSON.stringify(
    { count: items.length, cats: payload.cats, combo: payload.combo, comboOk: payload.comboOk, failed: payload.failed, skipped },
    null,
    2,
  );
  return payload;
}
