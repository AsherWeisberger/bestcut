import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function shot(url, path, size, waitText, selector) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByText(waitText).first().waitFor({ timeout: 25000 });
  await page.waitForTimeout(1600);
  if (selector) await page.locator(selector).first().screenshot({ path });
  else await page.screenshot({ path, fullPage: false });
  await ctx.close();
  console.log("wrote", path);
}

const base = "http://127.0.0.1:4173/?proof=1";
await shot(base, "/workspace/bestcut/proof-desktop.png", { width: 1440, height: 900 }, "Style all");
await shot(base, "/workspace/bestcut/proof-phone.png", { width: 390, height: 844 }, "Split");
await shot(base, "/workspace/bestcut/proof-ui.png", { width: 1440, height: 900 }, "Bytes never leave", ".stage-frame");
await browser.close();
