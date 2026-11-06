import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The demo reads the core engine straight from source, so no build step is needed first.
const core = fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@traceflow/core': core } },
  build: { outDir: 'dist' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
