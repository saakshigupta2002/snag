#!/usr/bin/env node
// Build the looping README hero as an animated WebP: full colour, sharper and smaller than a GIF.
// Chrome encodes each frame and this script writes the RIFF container around them.
// Usage: node scripts/make-webp.mjs <frames-dir> <out.webp> [--width 1200] [--fps 12] [--quality 0.72]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};
const width = Number(flag("--width", "1200"));
const fps = Number(flag("--fps", "12"));
const quality = Number(flag("--quality", "0.72"));
const [dir, out] = args;
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);

const all = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
const step = 30 / fps;
const picks = [];
for (let i = 0; i < all.length; i += step) picks.push(all[Math.floor(i)]);

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
await page.goto("about:blank");
const height = Math.round((width * 9) / 16);

const chunk = (id, body) => {
  const pad = body.length % 2;
  const head = Buffer.alloc(8);
  head.write(id, 0, "ascii");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body, Buffer.alloc(pad)]);
};
const u24 = (n) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255]);

// A frame may hold only image data, so drop the VP8X header and ICC profile Chrome adds.
function imageChunks(webp) {
  const keep = [];
  for (let at = 12; at + 8 <= webp.length; ) {
    const id = webp.toString("ascii", at, at + 4);
    const size = webp.readUInt32LE(at + 4);
    const end = at + 8 + size + (size % 2);
    if (id === "VP8 " || id === "VP8L" || id === "ALPH") keep.push(webp.subarray(at, end));
    at = end;
  }
  return Buffer.concat(keep);
}

const frames = [];
const ms = Math.round(1000 / fps);
for (const name of picks) {
  const b64 = readFileSync(join(dir, name)).toString("base64");
  const url = await page.evaluate(
    async ([src, w, h, q]) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${src}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d", { alpha: false });
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, w, h);
      return c.toDataURL("image/webp", q);
    },
    [b64, width, height, quality],
  );
  const webp = Buffer.from(url.split(",")[1], "base64");
  const payload = imageChunks(webp);
  const header = Buffer.concat([u24(0), u24(0), u24(width - 1), u24(height - 1), u24(ms), Buffer.from([2])]);
  frames.push(chunk("ANMF", Buffer.concat([header, payload])));
}
await browser.close();

const vp8x = chunk("VP8X", Buffer.concat([Buffer.from([0x02, 0, 0, 0]), u24(width - 1), u24(height - 1)]));
const anim = chunk("ANIM", Buffer.from([0, 0, 0, 255, 0, 0]));
const body = Buffer.concat([Buffer.from("WEBP"), vp8x, anim, ...frames]);
const riff = Buffer.alloc(8);
riff.write("RIFF", 0, "ascii");
riff.writeUInt32LE(body.length, 4);
writeFileSync(out, Buffer.concat([riff, body]));
console.log(`wrote ${out}: ${picks.length} frames, ${(body.length / 1048576).toFixed(1)} MB`);
