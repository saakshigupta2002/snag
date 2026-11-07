#!/usr/bin/env node
// Render the README hero frame by frame from real session data.
// Usage: node scripts/render-hero.mjs <out-dir> [frame,frame,...]
// Needs Google Chrome and playwright-core (set PLAYWRIGHT_CORE to its path if it is not resolvable).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
const root = resolve(new URL("..", import.meta.url).pathname);
const src = join(root, "docs", "assets", "src", "hero");
const [out, only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${join(src, "index.html")}`, { waitUntil: "networkidle" });
await page.evaluate(async (data) => {
  await Promise.all([
    document.fonts.load('112px "Instrument Serif"'),
    document.fonts.load('500 26px Geist'),
    document.fonts.load('400 22px "Geist Mono"'),
  ]);
  window.load(data);
}, JSON.parse(readFileSync(join(src, "sessions.json"), "utf8")));
const total = await page.evaluate(() => window.FRAMES);
const frames = only ? only.split(",").map(Number) : Array.from({ length: total }, (_, i) => i);
for (const f of frames) {
  const url = await page.evaluate((n) => { window.draw(n); return document.getElementById("c").toDataURL("image/jpeg", 0.94); }, f);
  writeFileSync(join(out, `f${String(f).padStart(4, "0")}.jpg`), Buffer.from(url.split(",")[1], "base64"));
  if (!only && f % 120 === 0) console.log(`frame ${f}/${total}`);
}
await browser.close();
