import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const base = process.env.QA_URL || "http://127.0.0.1:4173";

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${base}/?overlayqa=1`, { waitUntil: "networkidle" });
await page.locator("#overlay-qa").waitFor({ timeout: 40000 });
const payload = await page.evaluate(() => window.__OVERLAY_QA);
if (!payload) throw new Error("no overlay QA payload");
const failed = (payload.results || []).filter((r) => !r.ok);
console.log("overlays", payload.results.length, "failed", failed.map((f) => f.id).join(",") || "none");
console.log("combo", payload.combo, "comboOk", payload.comboOk);
if (payload.png) {
  const b64 = String(payload.png).replace(/^data:image\/png;base64,/, "");
  writeFileSync("/workspace/bestcut/proof-overlay-combo.png", Buffer.from(b64, "base64"));
  console.log("wrote proof-overlay-combo.png");
}
if (failed.length || !payload.comboOk) {
  console.error(JSON.stringify({ failed, combo: payload.combo }, null, 2));
  await browser.close();
  process.exit(1);
}
await ctx.close();

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await phone.newPage();
await p.goto(`${base}/?proof=1`, { waitUntil: "networkidle" });
await p.locator(".dock").waitFor({ timeout: 25000 });
await p.getByText("Export").first().waitFor({ timeout: 25000 });
await p.waitForTimeout(1600);
const titleClip = p.locator(".clip.text").first();
await titleClip.waitFor({ timeout: 15000 });
await titleClip.click({ force: true });
await p.waitForTimeout(400);
const motion = p.locator(".dock").getByText("Motion");
if (await motion.count()) await motion.click();
else {
  const style = p.locator(".dock").getByText("Style");
  if (await style.count()) await style.click();
}
await p.waitForTimeout(400);
const rail = p.locator(".sheet .cat-rail").first();
await rail.waitFor({ timeout: 12000 });
await rail.scrollIntoViewIfNeeded();
const dock = p.locator(".dock");
const sheet = p.locator(".sheet").first();
const railBox = await rail.boundingBox();
const dockBox = await dock.boundingBox();
const sheetBox = await sheet.boundingBox();
if (!railBox || !dockBox || !sheetBox) throw new Error("missing rail or dock");
const sheetOverlap = sheetBox.y + sheetBox.height - dockBox.y;
if (sheetOverlap > 12) {
  console.error("sheet covers dock", { sheetBox, dockBox, sheetOverlap });
  await browser.close();
  process.exit(1);
}
if (railBox.width < 200) throw new Error("cat rail too narrow");
await p.screenshot({ path: "/workspace/bestcut/proof-phone-overlays.png" });
console.log("phone rail ok", { railBox, dockBox, sheetBox, sheetOverlap });
await phone.close();
await browser.close();
console.log("overlay QA pass");
