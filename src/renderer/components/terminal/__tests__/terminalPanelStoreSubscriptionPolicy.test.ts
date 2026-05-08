import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const terminalPanelSource = readFileSync(resolve(currentDir, '../TerminalPanel.tsx'), 'utf8');

describe('terminalPanelStoreSubscriptionPolicy', () => {
  it('avoids whole-store worktree activity subscriptions', () => {
    expect(terminalPanelSource).not.toContain(
      'const { setTerminalCount, registerTerminalCloseHandler } = useWorktreeActivityStore();'
    );
    expect(terminalPanelSource).toContain('const setTerminalCount = useWorktreeActivityStore(');
    expect(terminalPanelSource).toContain(
      'const registerTerminalCloseHandler = useWorktreeActivityStore('
    );
  });
});
