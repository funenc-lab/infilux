import {
  advanceTerminalReplayParserState,
  appendTerminalReplayTail,
  resolveTerminalReplayParserState,
  type TerminalReplayTailState,
  takeTerminalReplayTail,
} from '@shared/utils/terminalReplayTail';
import { describe, expect, it, vi } from 'vitest';
import { getSessionReplayBufferRuntimeSource } from '../SessionReplayBufferSource';

interface GeneratedReplayBuffer {
  readonly length: number;
  readonly chunks: string[];
  append(value: string): void;
  replace(value: string): void;
  toString(): string;
}

function createGeneratedReplayBuffer(
  maxCodeUnits: number,
  initialValue = '',
  advanceParser = advanceTerminalReplayParserState
): GeneratedReplayBuffer {
  const BufferClass = new Function(
    'advanceTerminalReplayParserState',
    'resolveTerminalReplayParserState',
    'takeTerminalReplayTail',
    'isHighSurrogate',
    'isLowSurrogate',
    `${getSessionReplayBufferRuntimeSource()}\nreturn SessionReplayBuffer;`
  )(
    advanceParser,
    resolveTerminalReplayParserState,
    takeTerminalReplayTail,
    (code: number) => code >= 0xd800 && code <= 0xdbff,
    (code: number) => code >= 0xdc00 && code <= 0xdfff
  ) as new (
    limit: number,
    initial: string
  ) => GeneratedReplayBuffer;
  return new BufferClass(maxCodeUnits, initialValue);
}

describe('generated SessionReplayBuffer', () => {
  it('only scans the discarded prefix when a small append exceeds capacity', () => {
    const advanceParser = vi.fn(advanceTerminalReplayParserState);
    const buffer = createGeneratedReplayBuffer(1024, 'x'.repeat(1024), advanceParser);
    const materialize = vi.spyOn(buffer, 'toString');

    buffer.append('y');

    expect(advanceParser).toHaveBeenCalledTimes(1);
    expect(materialize).not.toHaveBeenCalled();
    expect(buffer.length).toBe(1024);
    expect(buffer.toString()).toBe(`${'x'.repeat(1023)}y`);
  });

  it('preserves order across repeated chunk eviction and compaction', () => {
    const buffer = createGeneratedReplayBuffer(128);
    const chunks = Array.from({ length: 2048 }, (_, index) => `${index}\n`);
    const materialize = vi.spyOn(buffer, 'toString');

    for (const chunk of chunks) {
      buffer.append(chunk);
      expect(buffer.length).toBeLessThanOrEqual(128);
    }

    expect(materialize).not.toHaveBeenCalled();
    expect(buffer.toString()).toBe(chunks.join('').slice(-128));
  });

  it('keeps surrogate pairs safe when they span retained chunks', () => {
    const buffer = createGeneratedReplayBuffer(4);

    buffer.append('A\ud83d');
    buffer.append('\ude80');
    buffer.append('BC');
    expect(buffer.toString()).toBe('\u{1F680}BC');
    buffer.append('D');

    expect(buffer.toString()).toBe('BCD');
    expect(buffer.length).toBe(3);
  });

  it('drops a split low surrogate when the next chunk exactly fills capacity', () => {
    const buffer = createGeneratedReplayBuffer(8, 'abc\ud83d');

    buffer.append(`\ude80${'x'.repeat(7)}`);

    expect(buffer.toString()).toBe('x'.repeat(7));
    expect(buffer.length).toBe(7);
  });

  it('keeps the replay UTF-16-safe after ANSI clipping an oversized chunk', () => {
    const buffer = createGeneratedReplayBuffer(5);

    buffer.append('\x1b\u{1F680}abc');

    expect(buffer.toString()).toBe('abc');
    expect(buffer.length).toBe(3);
  });

  it('releases consumed chunk references before periodic array compaction', () => {
    const limit = 1024;
    const buffer = createGeneratedReplayBuffer(limit);

    for (let index = 0; index < 40; index += 1) {
      buffer.append(`${index}:`.padEnd(512, 'x'));
      const referencedLength = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0);

      expect(referencedLength).toBeLessThanOrEqual(limit + 512);
      expect(buffer.length).toBeLessThanOrEqual(limit);
    }

    expect(buffer.toString()).toBe(`${'38:'.padEnd(512, 'x')}${'39:'.padEnd(512, 'x')}`);
  });

  it('amortizes chunk-array compaction when output arrives one character at a time', () => {
    const buffer = createGeneratedReplayBuffer(1024);
    for (let index = 0; index < 1024; index += 1) buffer.append('x');
    const compact = vi.spyOn(buffer.chunks, 'splice');

    for (let index = 0; index < 1024; index += 1) buffer.append('y');

    expect(compact.mock.calls.length).toBeLessThanOrEqual(1);
    expect(buffer.toString()).toBe('y'.repeat(1024));
    expect(buffer.length).toBe(1024);
  });

  it('preserves discarded control-string state until a later terminator', () => {
    const buffer = createGeneratedReplayBuffer(8);

    buffer.append('\x1bP');
    buffer.append('x'.repeat(16));
    buffer.append('');
    buffer.append('\x1b');
    buffer.append('\\ready');

    expect(buffer.toString()).toBe('ready');
    expect(buffer.length).toBe(5);
  });

  it('resets pending parser state when replacing the replay', () => {
    const buffer = createGeneratedReplayBuffer(8);
    buffer.append(`\x1b]${'x'.repeat(16)}`);

    buffer.replace('snapshot');
    buffer.append('!');

    expect(buffer.toString()).toBe('napshot!');
    buffer.replace('');
    expect(buffer.toString()).toBe('');
    expect(buffer.length).toBe(0);
  });

  it.each([
    1, 2, 3, 16, 64, 256,
  ])('matches existing replay semantics for fragmented output at a %i-unit limit', (limit) => {
    const buffer = createGeneratedReplayBuffer(limit);
    let reference: TerminalReplayTailState = { replay: '', initialParserState: 'text' };
    const sequences = [
      'visible\n\u{1F680}',
      '\x1b[31mred\x1b[0m',
      '\x1b]0;title\x07ready',
      '\x1bP>|xterm.js(6.1.0)\x1b\\prompt',
      '\x90control\x9ctail',
      '\x9dtitle\x1b\\tail',
      '\x1b(0abc\x1b(B',
      '\x1b[123\x18cancelled',
      '\x1b]unfinished\x1acancelled',
      `\x1bP${'x'.repeat(limit + 17)}\x1b\\ready\n`,
      '\x1bPunterminated',
      'x'.repeat(limit + 31),
      '\x1b\\final\n',
    ];
    const chunks = sequences.flatMap((value, index) => {
      const width = (index % 5) + 1;
      return Array.from({ length: Math.ceil(value.length / width) }, (_, part) =>
        value.slice(part * width, (part + 1) * width)
      );
    });

    for (const chunk of chunks) {
      reference = appendTerminalReplayTail(reference, chunk, limit);
      buffer.append(chunk);

      expect(buffer.toString()).toBe(reference.replay);
      expect(buffer.length).toBe(reference.replay.length);
      expect(buffer.length).toBeLessThanOrEqual(limit);
    }
  });
});
