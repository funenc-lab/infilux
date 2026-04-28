import { describe, expect, it } from 'vitest';
import { resolveAgentCanvasFocusedSessionId } from '../agentCanvasSessionFocus';

describe('resolveAgentCanvasFocusedSessionId', () => {
  const canvasSessionIds = ['session-a', 'session-b', 'session-c'];

  it('keeps workspace canvas focus empty without an explicit session selection', () => {
    expect(
      resolveAgentCanvasFocusedSessionId({
        canvasSessionIds,
        groupActiveSessionId: 'session-c',
        isWorkspaceCanvasDisplayMode: true,
        persistedActiveSessionId: 'session-b',
        workspaceCanvasFocusedSessionId: null,
      })
    ).toBeNull();
  });

  it('preserves an explicit workspace canvas session focus across worktree changes', () => {
    expect(
      resolveAgentCanvasFocusedSessionId({
        canvasSessionIds,
        groupActiveSessionId: 'session-a',
        isWorkspaceCanvasDisplayMode: true,
        persistedActiveSessionId: 'session-a',
        workspaceCanvasFocusedSessionId: 'session-c',
      })
    ).toBe('session-c');
  });

  it('keeps the existing current-worktree canvas active session behavior', () => {
    expect(
      resolveAgentCanvasFocusedSessionId({
        canvasSessionIds,
        groupActiveSessionId: 'session-c',
        isWorkspaceCanvasDisplayMode: false,
        persistedActiveSessionId: 'session-b',
        workspaceCanvasFocusedSessionId: 'session-a',
      })
    ).toBe('session-b');
  });
});
