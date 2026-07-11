// Embeds the built browser SDK bundle into the ingest service so it can be
// served at /snag.js for drop-in <script> installs — no npm publish needed.
// Base64 so there are zero string-escaping hazards. Regenerate whenever the
// SDK changes:  npm run build -w @snag/sdk && npm run embed-sdk -w @snag/ingest
import { readFileSync, writeFileSync } from 'node:fs';

const bundleUrl = new URL('../../sdk/dist/snag.iife.js', import.meta.url);
const outUrl = new URL('../src/sdk-bundle.ts', import.meta.url);

let b64 = '';
try {
  b64 = readFileSync(bundleUrl).toString('base64');
} catch {
  console.warn('[embed-sdk] packages/sdk/dist/snag.iife.js not found — build the SDK first');
}

const out = `// AUTO-GENERATED — do not edit by hand.
// The browser SDK bundle (packages/sdk/dist/snag.iife.js), base64-encoded so
// the ingest service can serve it at /snag.js. Regenerate with:
//   npm run build -w @snag/sdk && npm run embed-sdk -w @snag/ingest
export const SDK_BUNDLE_BASE64 = ${JSON.stringify(b64)};
`;
writeFileSync(outUrl, out);
console.log(`[embed-sdk] wrote src/sdk-bundle.ts (${b64.length} base64 chars)`);
