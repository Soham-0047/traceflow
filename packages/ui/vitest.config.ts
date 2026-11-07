import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const core = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^@traceflow\/core$/, replacement: core }] },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
