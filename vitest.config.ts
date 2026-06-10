import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Unit tests (Vitest). Solo lógica pura (sin red, sin DOM): entorno node.
// El alias '@' espeja el de tsconfig para que los imports funcionen igual.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
