// Produces the drop-in <script> build: dist/snag.iife.js with rrweb bundled
// and window.Snag exposed. Module consumers use dist/index.js from tsc.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'browser',
  target: 'es2019',
  format: 'iife',
  globalName: '__SnagModule',
  footer: { js: 'window.Snag = __SnagModule.Snag;' },
  outfile: 'dist/snag.iife.js',
  logLevel: 'info',
});
