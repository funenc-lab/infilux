import { describe, expect, it } from 'vitest';
import { createFileTreeRootQueryRemountTracker } from '../fileTreeRootQueryRemountTracker';

describe('fileTreeRootQueryRemountTracker', () => {
  it('tracks the last inactive timestamp per root path', () => {
    const tracker = createFileTreeRootQueryRemountTracker();

    tracker.markInactive('/repo', 123);

    expect(tracker.getLastInactiveAt('/repo')).toBe(123);
    expect(tracker.getLastInactiveAt('/missing')).toBeNull();
  });

  it('clears individual root paths and supports full reset', () => {
    const tracker = createFileTreeRootQueryRemountTracker();

    tracker.markInactive('/repo-a', 123);
    tracker.markInactive('/repo-b', 456);
    tracker.clear('/repo-a');

    expect(tracker.getLastInactiveAt('/repo-a')).toBeNull();
    expect(tracker.getLastInactiveAt('/repo-b')).toBe(456);

    tracker.reset();

    expect(tracker.getLastInactiveAt('/repo-b')).toBeNull();
  });
});
