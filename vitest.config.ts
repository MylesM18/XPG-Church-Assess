import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './') } },
  // .tsx is included so a component can be asserted by RENDERING it (react-dom/server, no DOM and
  // no new deps) rather than only by reading its source — see answer-form-first-paint.test.tsx.
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node' },
});
