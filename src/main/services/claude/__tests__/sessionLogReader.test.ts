import { TASK_COMPLETION_MARKER } from '@shared/types/agent';
import { describe, expect, it } from 'vitest';
import { checkTaskCompletion } from '../sessionLogReader';

describe('sessionLogReader', () => {
  it('detects task completion markers only when they appear on their own line', () => {
    expect(checkTaskCompletion([`Done\n${TASK_COMPLETION_MARKER}`])).toEqual({
      completed: true,
    });

    expect(
      checkTaskCompletion([`The required marker is ${TASK_COMPLETION_MARKER}, but not emitted.`])
    ).toEqual({
      completed: false,
    });
  });
});
