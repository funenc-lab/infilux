import { describe, expect, it } from 'vitest';
import {
  AGENT_SESSION_REPLAY_CHAR_LIMIT,
  appendSessionReplayTail,
  getSessionReplayCharLimit,
  TERMINAL_SESSION_REPLAY_CHAR_LIMIT,
} from '../agentTerminalHistoryPolicy';

describe('agentTerminalHistoryPolicy', () => {
  it('uses a larger replay budget for agent sessions than shell terminals', () => {
    expect(getSessionReplayCharLimit('agent')).toBe(AGENT_SESSION_REPLAY_CHAR_LIMIT);
    expect(getSessionReplayCharLimit('terminal')).toBe(TERMINAL_SESSION_REPLAY_CHAR_LIMIT);
    expect(AGENT_SESSION_REPLAY_CHAR_LIMIT).toBeGreaterThan(TERMINAL_SESSION_REPLAY_CHAR_LIMIT);
  });

  it('trims shell terminal replay to the terminal tail budget', () => {
    const output = 't'.repeat(TERMINAL_SESSION_REPLAY_CHAR_LIMIT + 10);

    const replay = appendSessionReplayTail('', output, 'terminal');

    expect(replay).toHaveLength(TERMINAL_SESSION_REPLAY_CHAR_LIMIT);
    expect(replay).toBe(output.slice(-TERMINAL_SESSION_REPLAY_CHAR_LIMIT));
  });

  it('keeps agent replay beyond the shell terminal tail budget', () => {
    const output = 'a'.repeat(TERMINAL_SESSION_REPLAY_CHAR_LIMIT + 10);

    const replay = appendSessionReplayTail('', output, 'agent');

    expect(replay).toBe(output);
  });

  it('does not begin a bounded replay tail with a low surrogate', () => {
    const trailing = 't'.repeat(TERMINAL_SESSION_REPLAY_CHAR_LIMIT - 1);
    const output = `A\u{1F680}${trailing}`;

    expect(appendSessionReplayTail('', output, 'terminal')).toBe(trailing);
  });
});
