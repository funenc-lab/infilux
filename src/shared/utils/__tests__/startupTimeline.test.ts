import { describe, expect, it } from 'vitest';
import { createStartupTimelineRecorder, formatStartupTimelineEntry } from '../startupTimeline';

describe('startupTimeline', () => {
  it('tracks stage durations against the previous stage and the initial start', () => {
    const timestamps = [1000, 1017, 1050];
    const recorder = createStartupTimelineRecorder('main', () => timestamps.shift() ?? 1050);

    const first = recorder.markStage('module-evaluated');
    const second = recorder.markStage('app-ready');
    const third = recorder.markStage('main-window-created');

    expect(first).toEqual({
      source: 'main',
      stage: 'module-evaluated',
      timestampMs: 1000,
      sincePreviousMs: 0,
      sinceStartMs: 0,
    });
    expect(second).toMatchObject({
      stage: 'app-ready',
      sincePreviousMs: 17,
      sinceStartMs: 17,
    });
    expect(third).toMatchObject({
      stage: 'main-window-created',
      sincePreviousMs: 33,
      sinceStartMs: 50,
    });
  });

  it('returns immutable snapshots and formats entries consistently', () => {
    const recorder = createStartupTimelineRecorder('renderer', () => 2000);
    const entry = recorder.markStage('rendering-root');
    const snapshot = recorder.getEntries();

    snapshot[0].stage = 'mutated';

    expect(recorder.getEntries()[0]?.stage).toBe('rendering-root');
    expect(formatStartupTimelineEntry(entry)).toBe(
      '[startup][renderer] rendering-root +0ms (0ms total)'
    );
  });
});
