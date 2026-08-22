/* @vitest-environment jsdom */

import type { Terminal } from '@xterm/xterm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installXtermOutputProtocolGuard } from '../xtermOutputProtocolGuard';

function writeTerminal(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => {
    terminal.write(data, resolve);
  });
}

describe('xterm output protocol guard integration', () => {
  const terminals: Terminal[] = [];

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    for (const terminal of terminals) {
      terminal.dispose();
    }
    terminals.length = 0;
    vi.restoreAllMocks();
  });

  it('suppresses backend-output queries without suppressing direct terminal input', async () => {
    let writingBackendOutput = true;
    const { Terminal } = await import('@xterm/xterm');
    const terminal = new Terminal({
      windowOptions: {
        getWinSizeChars: true,
      },
    });
    terminals.push(terminal);
    const output: string[] = [];
    terminal.onData((data) => output.push(data));
    installXtermOutputProtocolGuard(terminal.parser, () => writingBackendOutput);

    await writeTerminal(terminal, '\x1b[>c\x1b[>q\x1b[18t');

    expect(output).toEqual([]);

    terminal.input('typed input\r');

    expect(output).toEqual(['typed input\r']);

    writingBackendOutput = false;
    await writeTerminal(terminal, '\x1b[>c\x1b[>q\x1b[18t');

    expect(output).toHaveLength(4);
    expect(output[1]?.startsWith('\x1b[>')).toBe(true);
    expect(output[1]?.endsWith('c')).toBe(true);
    expect(output[2]?.startsWith('\x1bP>|xterm.js(')).toBe(true);
    expect(output[2]?.endsWith('\x1b\\')).toBe(true);
    expect(output[3]?.startsWith('\x1b[8;')).toBe(true);
    expect(output[3]?.endsWith('t')).toBe(true);
  });
});
