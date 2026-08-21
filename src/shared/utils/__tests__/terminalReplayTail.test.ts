import { describe, expect, it } from 'vitest';
import { appendTerminalReplayTail, takeTerminalReplayTail } from '../terminalReplayTail';

const ESC = '\x1b';
const BEL = '\x07';

describe('takeTerminalReplayTail', () => {
  it.each([
    ['CSI', `${ESC}[38;5;248m`],
    ['OSC', `${ESC}]0;Infilux${BEL}`],
    ['DCS', `${ESC}P>|xterm.js(6.1.0-beta.141)${ESC}\\`],
    ['APC', `${ESC}_payload${ESC}\\`],
    ['C1 OSC', `\u009d0;Infilux${BEL}`],
    ['ESC intermediate', `${ESC}(0`],
  ])('drops a partial %s sequence at the bounded tail start', (_name, sequence) => {
    const prefix = 'completed\n';
    const visibleOutput = 'prompt ready\n';
    const value = `${prefix}${sequence}${visibleOutput}`;
    const maxCodeUnits = sequence.length - 2 + visibleOutput.length;

    expect(takeTerminalReplayTail(value, maxCodeUnits)).toBe(visibleOutput);
  });

  it('retains a complete terminal control sequence when it starts at the tail boundary', () => {
    const prefix = 'completed\n';
    const sequence = `${ESC}[>0;276;0c`;
    const visibleOutput = 'prompt ready\n';

    expect(
      takeTerminalReplayTail(
        `${prefix}${sequence}${visibleOutput}`,
        sequence.length + visibleOutput.length
      )
    ).toBe(`${sequence}${visibleOutput}`);
  });

  it('does not split a surrogate pair while finding a safe terminal replay boundary', () => {
    const sequence = `${ESC}]0;Infilux${BEL}`;
    const visibleOutput = `\u{1F680} ready\n`;
    const value = `prefix${sequence}${visibleOutput}`;

    expect(takeTerminalReplayTail(value, sequence.length - 2 + visibleOutput.length)).toBe(
      visibleOutput
    );
  });

  it.each([
    ['CAN', '\x18'],
    ['SUB', '\x1a'],
  ])('treats %s as the end of a partially retained control sequence', (_name, terminator) => {
    const sequence = `${ESC}]0;Infilux${terminator}`;
    const visibleOutput = 'prompt ready\n';
    const value = `completed\n${sequence}${visibleOutput}`;

    expect(takeTerminalReplayTail(value, sequence.length - 2 + visibleOutput.length)).toBe(
      visibleOutput
    );
  });

  it('keeps parser state when an unterminated control string exceeds the replay limit', () => {
    const initial = appendTerminalReplayTail(
      { replay: '', initialParserState: 'text' },
      `${ESC}P${'x'.repeat(16)}`,
      8
    );

    expect(initial).toEqual({ replay: '', initialParserState: 'string' });
    expect(appendTerminalReplayTail(initial, `${ESC}\\prompt ready\n`, 16)).toEqual({
      replay: 'prompt ready\n',
      initialParserState: 'text',
    });
  });
});
