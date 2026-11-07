import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@traceflow\/core$/, replacement: at('../../packages/core/src/index.ts') }],
  },
  test: { environment: 'node', globals: true },
});
