import { describe, expect, it } from 'vitest';
import { resolveSessionSubagentTriggerPresentation } from '../sessionSubagentTriggerPolicy';

describe('session subagent trigger policy', () => {
  it('hides the trigger when the session does not support subagent tracking', () => {
    expect(
      resolveSessionSubagentTriggerPresentation(
        {
          kind: 'unsupported',
          reason: 'provider-not-supported',
        },
        3
      )
    ).toEqual({
      visible: false,
      emphasized: false,
    });
  });

  it('hides the trigger while the session has no tracked subagent sessions', () => {
    expect(
      resolveSessionSubagentTriggerPresentation(
        {
          kind: 'pending',
          provider: 'codex',
          reason: 'session-not-ready',
        },
        0
      )
    ).toEqual({
      visible: false,
      emphasized: false,
    });
    expect(
      resolveSessionSubagentTriggerPresentation(
        {
          kind: 'supported',
          provider: 'codex',
        },
        0
      )
    ).toEqual({
      visible: false,
      emphasized: false,
    });
  });

  it('emphasizes the trigger only when a supported session has tracked subagents', () => {
    expect(
      resolveSessionSubagentTriggerPresentation(
        {
          kind: 'supported',
          provider: 'codex',
        },
        2
      )
    ).toEqual({
      visible: true,
      emphasized: true,
    });
  });
});
