import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isFocusLocked,
  lockFocus,
  pauseFocusLock,
  restoreFocus,
  restoreFocusIfLocked,
  unlockFocus,
  withFocusPause,
} from '../focusLock';

describe('focusLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    unlockFocus('session-a');
    unlockFocus('session-b');
    unlockFocus('session-c');
    unlockFocus('session-d');
  });

  it('locks, pauses, resumes, and unlocks focus by session id', () => {
    expect(isFocusLocked('session-a')).toBe(false);

    lockFocus('session-a');
    expect(isFocusLocked('session-a')).toBe(true);

    const release = pauseFocusLock('session-a');
    expect(isFocusLocked('session-a')).toBe(false);

    release();
    expect(isFocusLocked('session-a')).toBe(true);

    release();
    unlockFocus('session-a');
    expect(isFocusLocked('session-a')).toBe(false);
  });

  it('pauses focus lock for async work and restores the lock state afterwards', async () => {
    lockFocus('session-b');

    const result = await withFocusPause('session-b', async () => {
      expect(isFocusLocked('session-b')).toBe(false);
      return 'done';
    });

    expect(result).toBe('done');
    expect(isFocusLocked('session-b')).toBe(true);
  });

  it('restores the lock state when paused work throws', async () => {
    lockFocus('session-b');

    await expect(
      withFocusPause('session-b', async () => {
        expect(isFocusLocked('session-b')).toBe(false);
        throw new Error('failed');
      })
    ).rejects.toThrow('failed');

    expect(isFocusLocked('session-b')).toBe(true);
  });

  it('allows pause releases after the session state has already been removed', () => {
    const release = pauseFocusLock('session-b');

    unlockFocus('session-b');

    expect(() => release()).not.toThrow();
    expect(isFocusLocked('session-b')).toBe(false);
  });

  it('restores focus to the matching enhanced input and respects lock state', () => {
    const focus = vi.fn();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('document', {
      querySelectorAll: vi.fn(() => [
        { dataset: { enhancedInputSessionId: 'session-c' }, focus },
        { dataset: { enhancedInputSessionId: 'other-session' }, focus: vi.fn() },
      ]),
    });

    expect(restoreFocus('missing-session')).toBe(false);

    lockFocus('session-c');
    expect(restoreFocusIfLocked('session-c')).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);

    unlockFocus('session-c');
    expect(restoreFocusIfLocked('session-c')).toBe(false);
  });

  it('returns false when no enhanced input can be found for the session', () => {
    vi.stubGlobal('document', {
      querySelectorAll: vi.fn(() => []),
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn());

    lockFocus('session-d');

    expect(restoreFocus('session-d')).toBe(false);
    expect(restoreFocusIfLocked('session-d')).toBe(false);
  });
});
