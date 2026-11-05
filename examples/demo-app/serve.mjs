// Tiny static server for the demo app. Serves this directory plus the built
// SDK bundle. Run `npm run build:libs` first, then `npm run demo`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const sdkBundle = fileURLToPath(
  new URL('../../packages/sdk/dist/snag.iife.js', import.meta.url),
);
const port = Number(process.env.PORT) || 5173;

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // Broken on purpose, so the failed request shows up next to the click.
  if (url.pathname === '/api/orders') {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'payment service unavailable' }));
    return;
  }
  let file;
  if (url.pathname === '/snag.iife.js') {
    file = sdkBundle;
  } else {
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'text/plain' });
    res.end(body);
  } catch {
    // SPA-style fallback so fake navigations reload fine.
    const body = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(body);
  }
}).listen(port, () => {
  console.log(`Demo app → http://localhost:${port}/?key=pk_live_…&endpoint=http://localhost:8787`);
  console.log('(build the SDK first: npm run build:libs)');
});
