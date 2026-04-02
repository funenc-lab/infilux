import { describe, expect, it, vi } from 'vitest';
import {
  createAgentStartupTimelineLogger,
  formatAgentStartupTimelineEntry,
} from '../agentStartupTimeline';

describe('agentStartupTimeline', () => {
  it('formats stage entries with source and dynamic labels', () => {
    const output = formatAgentStartupTimelineEntry({
      label: 'session-1',
      entry: {
        source: 'renderer',
        stage: 'first-output',
        timestampMs: 1050,
        sincePreviousMs: 20,
        sinceStartMs: 50,
      },
    });

    expect(output).toBe('[agent-startup][renderer][session-1] first-output +20ms (50ms total)');
  });

  it('records stage durations and resolves labels lazily', () => {
    const timestamps = [1000, 1012, 1040];
    let label = 'pending';
    const log = vi.fn();
    const logger = createAgentStartupTimelineLogger({
      source: 'main',
      getLabel: () => label,
      now: () => timestamps.shift() ?? 1040,
      log,
    });

    logger.markStage('spawn-start');
    label = 'agent-1';
    const second = logger.markStage('spawned-primary');
    logger.markStage('first-output');

    expect(second).toMatchObject({
      stage: 'spawned-primary',
      sincePreviousMs: 12,
      sinceStartMs: 12,
    });
    expect(log).toHaveBeenNthCalledWith(
      1,
      '[agent-startup][main][pending] spawn-start +0ms (0ms total)'
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      '[agent-startup][main][agent-1] spawned-primary +12ms (12ms total)'
    );
    expect(logger.getEntries()).toHaveLength(3);
  });
});
