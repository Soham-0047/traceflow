import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Same pattern as demo/: the Custom UI consumes the engine and shared UI from source.
// outDir is `build`: the manifest's Custom UI resource points at that directory, and
// Forge serves it as built (it does not build it). `npm run build -w @traceflow/app`.
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: [
      { find: /^@traceflow\/core$/, replacement: at('../../../packages/core/src/index.ts') },
      { find: /^@traceflow\/ui\/styles\.css$/, replacement: at('../../../packages/ui/src/styles/app.css') },
      { find: /^@traceflow\/ui$/, replacement: at('../../../packages/ui/src/index.ts') },
    ],
  },
  build: { outDir: 'build' },
});
