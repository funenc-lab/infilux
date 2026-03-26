import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const modalSource = readFileSync(resolve(currentDir, '../QuickTerminalModal.tsx'), 'utf8');

describe('QuickTerminalModal exit wiring', () => {
  it('clears stale quick terminal sessions when the shell exits unexpectedly', () => {
    expect(modalSource).toMatch(
      /<ShellTerminal[\s\S]*?onExit=\{terminalCwd === cwd \? handleRealClose : undefined\}/m
    );
  });
});
