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
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/main/ipc/fileUtils.ts',
        'src/main/ipc/files.ts',
        'src/main/ipc/settings.ts',
        'src/main/ipc/tempWorkspace.ts',
        'src/main/services/git/gitLogFormat.ts',
        'src/main/services/session/SessionManager.ts',
        'src/renderer/App/hooks/useTerminalNavigation.ts',
        'src/renderer/components/files/javaFoldingUtils.ts',
        'src/renderer/stores/editor.ts',
        'src/renderer/stores/navigation.ts',
        'src/renderer/stores/repository.ts',
        'src/renderer/stores/settings/**/*.ts',
        'src/renderer/stores/sourceControl.ts',
        'src/renderer/stores/tempWorkspace.ts',
        'src/renderer/stores/terminal.ts',
        'src/renderer/stores/terminalWrite.ts',
        'src/renderer/stores/worktree.ts',
        'src/shared/i18n.ts',
        'src/shared/utils/**/*.ts',
      ],
      exclude: ['src/**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
      thresholds: {
        statements: 80,
        lines: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
});
