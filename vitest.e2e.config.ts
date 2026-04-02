import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['e2e/**/*.test.ts'],
    testTimeout: 300000,
    hookTimeout: 300000,
    fileParallelism: false,
    maxConcurrency: 1,
    pool: 'forks',
  },
});
