import { defineConfig } from 'vitest/config';
import path from 'node:path';
// Run the existing connector regression cases against the mobile signing
// adapter, not Node crypto. The web code remains untouched.
export default defineConfig({
  root: path.resolve(__dirname, '..'),
  test: { include: ['src/lib/connectors/**/*.test.ts'], environment: 'node' },
  resolve: { alias: [
    { find: /^vitest$/, replacement: path.resolve(__dirname, 'node_modules/vitest/dist/index.js') },
    { find: /^crypto$/, replacement: path.resolve(__dirname, 'src/services/portable-crypto.ts') },
    { find: '@', replacement: path.resolve(__dirname, '../src') },
  ] },
});
