import { describe, expect, it } from 'vitest';
import { XTERM_OUTPUT_WRITE_CHAR_LIMIT } from '../xtermOutputBuffer';
import { writeXtermReplay, type XtermReplayTerminal } from '../xtermReplayRestore';

function createTerminal() {
  const calls: string[] = [];
  const written: string[] = [];
  const terminal: XtermReplayTerminal = {
    rows: 24,
    refresh: (start, end) => {
      calls.push(`refresh:${start}:${end}`);
    },
    scrollToBottom: () => {
      calls.push('bottom');
    },
    scrollToLine: (line) => {
      calls.push(`line:${line}`);
    },
    write: (data, callback) => {
      calls.push(`write:${data.length}`);
      written.push(data);
      callback();
    },
  };

  return { calls, terminal, written };
}

describe('writeXtermReplay', () => {
  it('writes every character before restoring the saved viewport', async () => {
    const { calls, terminal, written } = createTerminal();
    const content = `${'a'.repeat(XTERM_OUTPUT_WRITE_CHAR_LIMIT - 1)}😀${'b'.repeat(12)}`;

    await expect(
      writeXtermReplay({
        content,
        shouldContinue: () => true,
        terminal,
        viewport: { kind: 'line', line: 17 },
      })
    ).resolves.toBe(true);

    expect(written.join('')).toBe(content);
    expect(calls).toEqual([
      `write:${XTERM_OUTPUT_WRITE_CHAR_LIMIT - 1}`,
      'write:14',
      'line:17',
      'refresh:0:23',
    ]);
  });

  it('does not change the viewport after a cancelled replay', async () => {
    const { calls, terminal, written } = createTerminal();

    await expect(
      writeXtermReplay({
        content: 'history',
        shouldContinue: () => false,
        terminal,
        viewport: { kind: 'bottom' },
      })
    ).resolves.toBe(false);

    expect(written).toEqual([]);
    expect(calls).toEqual([]);
  });
});
