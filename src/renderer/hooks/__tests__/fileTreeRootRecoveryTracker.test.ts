import { describe, expect, it } from 'vitest';
import { createFileTreeRootRecoveryTracker } from '../fileTreeRootRecoveryTracker';

describe('createFileTreeRootRecoveryTracker', () => {
  it('tracks only the current recovered root path', () => {
    const tracker = createFileTreeRootRecoveryTracker();

    tracker.mark('/repo-a');
    expect(tracker.has('/repo-a')).toBe(true);

    tracker.mark('/repo-b');
    expect(tracker.has('/repo-a')).toBe(false);
    expect(tracker.has('/repo-b')).toBe(true);
  });

  it('clears the tracked root path on reset and ignores unrelated clear requests', () => {
    const tracker = createFileTreeRootRecoveryTracker();

    tracker.mark('/repo-a');
    tracker.clear('/repo-b');
    expect(tracker.has('/repo-a')).toBe(true);

    tracker.reset();
    expect(tracker.has('/repo-a')).toBe(false);
  });

  it('clears the tracked root path when the matching recovery attempt fails', () => {
    const tracker = createFileTreeRootRecoveryTracker();

    tracker.mark('/repo-a');
    tracker.clear('/repo-a');

    expect(tracker.has('/repo-a')).toBe(false);
  });
});
