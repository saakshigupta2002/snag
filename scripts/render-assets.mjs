#!/usr/bin/env node
// Render the README diagram and logo from their HTML sources with a local Chrome, in light and dark.
// Needs Google Chrome and playwright-core (npm i -D playwright-core, or set PLAYWRIGHT_CORE to its path).
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core"));
} catch {
  console.error("playwright-core not found. Run `npm i -D playwright-core` or set PLAYWRIGHT_CORE.");
  process.exit(1);
}
const chrome = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find(existsSync);
const out = join(resolve(new URL("..", import.meta.url).pathname), "docs", "assets");
const browser = await chromium.launch({ executablePath: chrome, headless: true });
for (const theme of ["light", "dark"]) {
  for (const [file, selector, name] of [
    ["how-it-works.html", "#fig", "how-it-works"],
    ["logo.html", "#logo", "logo"],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1240, height: 800 }, deviceScaleFactor: 2, colorScheme: theme });
    await page.goto(`file://${join(out, "src", file)}`, { waitUntil: "networkidle" });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.evaluate(() => document.fonts.ready);
    await page.locator(selector).screenshot({ path: join(out, `${name}-${theme}.png`), omitBackground: true });
    await page.close();
    console.log(`wrote docs/assets/${name}-${theme}.png`);
  }
}
await browser.close();
