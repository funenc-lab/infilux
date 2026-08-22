import { XtermOutputBuffer } from './xtermOutputBuffer';

export interface XtermReplayTerminal {
  rows: number;
  refresh(start: number, end: number): void;
  scrollToBottom(): void;
  scrollToLine(line: number): void;
  write(data: string, callback: () => void): void;
}

export type XtermReplayViewport =
  | { kind: 'bottom' }
  | {
      kind: 'line';
      line: number;
    };

interface WriteXtermReplayOptions {
  content: string;
  shouldContinue: () => boolean;
  terminal: XtermReplayTerminal;
  viewport: XtermReplayViewport;
}

function restoreXtermReplayViewport(
  terminal: XtermReplayTerminal,
  viewport: XtermReplayViewport
): void {
  if (viewport.kind === 'line') {
    terminal.scrollToLine(viewport.line);
  } else {
    terminal.scrollToBottom();
  }
  terminal.refresh(0, Math.max(0, terminal.rows - 1));
}

export function writeXtermReplay({
  content,
  shouldContinue,
  terminal,
  viewport,
}: WriteXtermReplayOptions): Promise<boolean> {
  const outputBuffer = new XtermOutputBuffer();
  outputBuffer.append(content);

  return new Promise((resolve) => {
    const writeNextChunk = () => {
      if (!shouldContinue()) {
        resolve(false);
        return;
      }

      const chunk = outputBuffer.take();
      if (!chunk) {
        restoreXtermReplayViewport(terminal, viewport);
        resolve(true);
        return;
      }

      terminal.write(chunk, writeNextChunk);
    };

    writeNextChunk();
  });
}
