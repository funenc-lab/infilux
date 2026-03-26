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
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage-full',
      include: [
        'src/main/**/*.ts',
        'src/preload/**/*.ts',
        'src/renderer/**/*.ts',
        'src/renderer/**/*.tsx',
        'src/shared/**/*.ts',
      ],
      exclude: ['src/**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
    },
  },
});
