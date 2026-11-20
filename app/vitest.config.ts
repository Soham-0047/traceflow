import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The Forge app tests run against the engine and adapter source, like the demo.
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@traceflow\/core$/, replacement: at('../packages/core/src/index.ts') },
      { find: /^@traceflow\/ui$/, replacement: at('../packages/ui/src/index.ts') },
      // Pin @forge/bridge to the one workspace copy so vi.mock always intercepts it.
      { find: /^@forge\/bridge$/, replacement: at('../node_modules/@forge/bridge/out/index.js') },
    ],
  },
  test: { environment: 'node', globals: true },
});
