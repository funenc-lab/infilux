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
});
