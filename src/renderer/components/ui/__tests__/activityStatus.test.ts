import { describe, expect, it } from 'vitest';
import { getActivityStateMeta, getMainContentLiveStatus } from '../activityStatus';

describe('activityStatus', () => {
  it('returns consistent visual metadata for shared activity states', () => {
    expect(getActivityStateMeta('running')).toEqual({
      shortLabel: 'LIVE',
      label: 'Running',
      chipClassName: 'control-chip-live',
      dotClassName: 'bg-[color:var(--control-live)]',
    });

    expect(getActivityStateMeta('waiting_input')).toEqual({
      shortLabel: 'WAIT',
      label: 'Waiting for input',
      chipClassName: 'control-chip-wait',
      dotClassName: 'bg-[color:var(--control-wait)]',
    });

    expect(getActivityStateMeta('completed')).toEqual({
      shortLabel: 'DONE',
      label: 'Completed',
      chipClassName: 'control-chip-done',
      dotClassName: 'bg-[color:var(--control-done)]',
    });
  });

  it('prioritizes live status in the main header consistently', () => {
    expect(
      getMainContentLiveStatus({
        currentActivityState: 'waiting_input',
        outputtingSessionsCount: 2,
        unreadSessionsCount: 3,
        hasActiveWorktree: true,
      })
    ).toEqual({
      chipClassName: 'control-chip-wait',
      label: 'Waiting for input',
    });

    expect(
      getMainContentLiveStatus({
        currentActivityState: 'running',
        outputtingSessionsCount: 1,
        unreadSessionsCount: 3,
        hasActiveWorktree: true,
      })
    ).toEqual({
      chipClassName: 'control-chip-live',
      label: 'Live execution',
    });

    expect(
      getMainContentLiveStatus({
        currentActivityState: 'completed',
        outputtingSessionsCount: 0,
        unreadSessionsCount: 1,
        hasActiveWorktree: true,
      })
    ).toEqual({
      chipClassName: 'control-chip-done',
      label: 'Review ready',
    });

    expect(
      getMainContentLiveStatus({
        currentActivityState: 'idle',
        outputtingSessionsCount: 0,
        unreadSessionsCount: 0,
        hasActiveWorktree: true,
      })
    ).toEqual({
      chipClassName: '',
      label: 'Ready',
    });

    expect(
      getMainContentLiveStatus({
        currentActivityState: 'idle',
        outputtingSessionsCount: 0,
        unreadSessionsCount: 0,
        hasActiveWorktree: false,
      })
    ).toEqual({
      chipClassName: '',
      label: 'No worktree selected',
    });
  });
});
