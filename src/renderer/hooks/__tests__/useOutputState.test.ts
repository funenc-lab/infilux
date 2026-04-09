import { describe, expect, it } from 'vitest';
import { mapOutputStateToGlowState, resolveActivityGlowState } from '../useOutputState';

describe('useOutputState', () => {
  it('maps outputting runtime state to the running glow state', () => {
    expect(mapOutputStateToGlowState('outputting')).toBe('running');
  });

  it('maps unread runtime state to the completed glow state', () => {
    expect(mapOutputStateToGlowState('unread')).toBe('completed');
  });

  it('keeps idle runtime state unchanged', () => {
    expect(mapOutputStateToGlowState('idle')).toBe('idle');
  });

  it('prioritizes waiting input from worktree activity over idle terminal output', () => {
    expect(resolveActivityGlowState({ outputState: 'idle', activityState: 'waiting_input' })).toBe(
      'waiting_input'
    );
  });

  it('treats derived running activity as live even when the session output state is idle', () => {
    expect(resolveActivityGlowState({ outputState: 'idle', activityState: 'running' })).toBe(
      'running'
    );
  });

  it('preserves completed review state from unread output when no stronger activity exists', () => {
    expect(resolveActivityGlowState({ outputState: 'unread', activityState: 'idle' })).toBe(
      'completed'
    );
  });
});
