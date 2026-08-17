import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const base = process.env.QA_URL || "http://127.0.0.1:4173";
mkdirSync("/workspace/uploads", { recursive: true });

async function litPreview(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".stage-frame canvas");
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height);
    let n = 0;
    for (let i = 0; i < img.data.length; i += 16) {
      if (img.data[i] > 28 || img.data[i + 1] > 28 || img.data[i + 2] > 32) n++;
    }
    const clips = [...document.querySelectorAll(".clip.text")].length;
    const fx = !!document.querySelector("[data-fx-bin='1']");
    const scramble = !!document.querySelector("[data-fx='scramble']");
    return { n, clips, fx, scramble, w: width, h: height };
  });
}

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle", timeout: 45000 });
  await page.locator("[data-fx='scramble']").first().waitFor({ timeout: 25000 });
  await page.getByText("Kinetic", { exact: true }).first().waitFor();
  await page.getByText("Reveals", { exact: true }).first().waitFor();
  await page.getByText("Particles", { exact: true }).first().waitFor();
  await page.getByText("Glitch", { exact: true }).first().waitFor();
  await page.getByText("Stickers", { exact: true }).first().waitFor();
  const selected = await page.evaluate(() => document.querySelectorAll(".clip.on").length);
  if (selected) throw new Error("expected no clip selected on fresh load");
  await page.locator("[data-fx='scramble']").first().click();
  await page.locator(".clip.text").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const stats = await litPreview(page);
  console.log("desktop after scramble", stats);
  if (!stats.fx || !stats.scramble) throw new Error("FX bin missing on desktop");
  if (!stats.clips) throw new Error("scramble did not add an overlay clip");
  if (stats.n < 20) throw new Error("preview did not show the effect");
  await page.screenshot({ path: "/workspace/uploads/bestcut-fx-desktop.png" });
  await ctx.close();
  console.log("wrote /workspace/uploads/bestcut-fx-desktop.png");
}

{
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await phone.newPage();
  await p.goto(base, { waitUntil: "networkidle", timeout: 45000 });
  await p.locator(".dock").waitFor({ timeout: 25000 });
  await p.locator(".dock").getByText("FX", { exact: true }).waitFor({ timeout: 25000 });
  const sheet = p.locator(".fx-sheet");
  if (!(await sheet.isVisible().catch(() => false))) {
    await p.locator(".dock").getByText("FX", { exact: true }).click();
  }
  await sheet.waitFor({ state: "visible", timeout: 12000 });
  await p.locator(".fx-sheet [data-fx='scramble']").waitFor({ timeout: 12000 });
  const rail = p.locator(".fx-sheet .cat-rail").first();
  await rail.scrollIntoViewIfNeeded();
  const dock = p.locator(".dock");
  const railBox = await rail.boundingBox();
  const dockBox = await dock.boundingBox();
  const sheetBox = await sheet.boundingBox();
  if (!railBox || !dockBox || !sheetBox) throw new Error("missing FX sheet or dock");
  const sheetOverlap = sheetBox.y + sheetBox.height - dockBox.y;
  if (sheetOverlap > 12) {
    console.error("FX sheet covers dock", { sheetBox, dockBox, sheetOverlap });
    await browser.close();
    process.exit(1);
  }
  if (railBox.width < 200) throw new Error("FX rail too narrow");
  if (railBox.height < 28) throw new Error("FX rail collapsed to " + railBox.height);
  const cats = await p.locator(".fx-sheet .cat-rail button").allTextContents();
  console.log("phone cats", cats);
  if (!cats.includes("Kinetic") || !cats.includes("Reveals") || !cats.includes("Particles")) {
    throw new Error("FX categories missing from phone rail: " + cats.join(","));
  }
  await p.locator(".fx-sheet [data-fx='scramble']").click();
  await p.locator(".clip.text").first().waitFor({ timeout: 10000 });
  await p.waitForTimeout(500);
  const stats = await litPreview(p);
  console.log("phone after scramble", stats, { railBox, dockBox, sheetBox, sheetOverlap });
  if (!stats.fx || !stats.scramble) throw new Error("FX bin missing on phone");
  if (!stats.clips) throw new Error("scramble did not add an overlay clip on phone");
  if (stats.n < 8) throw new Error("phone preview did not show the effect");
  await p.screenshot({ path: "/workspace/uploads/bestcut-fx-phone.png" });
  await phone.close();
  console.log("wrote /workspace/uploads/bestcut-fx-phone.png");
}

await browser.close();
console.log("fx QA pass");
