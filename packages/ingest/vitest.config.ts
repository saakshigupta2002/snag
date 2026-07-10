import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@snag/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      '@snag/detectors': fileURLToPath(new URL('../detectors/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
