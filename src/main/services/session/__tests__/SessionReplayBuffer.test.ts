import { describe, expect, it } from 'vitest';
import { SessionReplayBuffer } from '../SessionReplayBuffer';

describe('SessionReplayBuffer', () => {
  it('retains a bounded tail across incremental appends without splitting surrogate pairs', () => {
    const buffer = new SessionReplayBuffer(6);

    buffer.append('abc');
    buffer.append('def');
    buffer.append('ghi');
    buffer.append('🚀');

    expect(buffer.length).toBe(6);
    expect(buffer.toString()).toBe('fghi🚀');
  });

  it('replaces oversized snapshots with their bounded tail', () => {
    const buffer = new SessionReplayBuffer(5, 'initial');

    buffer.replace('abc🚀def');

    expect(buffer.toString()).toBe('🚀def');
  });

  it('drops a truncated xterm device response before replaying the next visible output', () => {
    const prefix = 'completed\n';
    const deviceAttributes = '\x1b[>0;276;0c';
    const terminalIdentity = '\x1bP>|xterm.js(6.1.0-beta.141)\x1b\\';
    const visibleOutput = 'prompt ready\n';
    const buffer = new SessionReplayBuffer(terminalIdentity.length - 2 + visibleOutput.length);

    buffer.append(`${prefix}${deviceAttributes}${terminalIdentity}${visibleOutput}`);

    expect(buffer.toString()).toBe(visibleOutput);
  });

  it('preserves parser state when an oversized chunk continues a control string', () => {
    const visibleOutput = 'prompt ready\n';
    const continuedControlString = '>|xterm.js(6.1.0-beta.141)\x1b\\';
    const buffer = new SessionReplayBuffer(continuedControlString.length - 2);

    buffer.append('\x1bP');
    buffer.append(`${continuedControlString}${visibleOutput}`);

    expect(buffer.toString()).toBe(visibleOutput);
  });

  it('preserves parser state after an unterminated control string exceeds the replay limit', () => {
    const buffer = new SessionReplayBuffer(16);

    buffer.append(`\x1bP${'x'.repeat(32)}`);
    buffer.append('\x1b\\prompt ready\n');

    expect(buffer.toString()).toBe('prompt ready\n');
  });
});
