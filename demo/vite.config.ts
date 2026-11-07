import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The demo is a thin host: it reads the engine and the shared UI straight from source.
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: [
      { find: /^@traceflow\/core$/, replacement: at('../packages/core/src/index.ts') },
      { find: /^@traceflow\/ui\/styles\.css$/, replacement: at('../packages/ui/src/styles/app.css') },
      { find: /^@traceflow\/ui$/, replacement: at('../packages/ui/src/index.ts') },
    ],
  },
  build: { outDir: 'dist' },
  test: { environment: 'node', globals: true },
});
