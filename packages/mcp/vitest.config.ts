import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const core = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^@traceflow\/core$/, replacement: core }] },
  test: { environment: 'node' },
});
