import { describe, expect, it } from 'vitest';
import {
  canInsertAgentTerminalAttachments,
  resolveAgentTerminalAttachmentInsertDisposition,
} from '../agentTerminalAttachmentInsertPolicy';

describe('agentTerminalAttachmentInsertPolicy', () => {
  it('allows direct terminal insertion for ready native-input sessions that are not outputting', () => {
    expect(
      canInsertAgentTerminalAttachments({
        sessionId: 'backend-1',
        attachmentCount: 1,
        runtimeState: 'live',
        outputState: 'idle',
      })
    ).toBe(true);
  });

  it('allows direct terminal insertion while the agent is explicitly waiting for user input', () => {
    const waitingForInputOptions = {
      sessionId: 'backend-1',
      attachmentCount: 1,
      runtimeState: 'live' as const,
      outputState: 'outputting' as const,
      waitingForInput: true,
    };

    expect(resolveAgentTerminalAttachmentInsertDisposition(waitingForInputOptions)).toBe('insert');
    expect(canInsertAgentTerminalAttachments(waitingForInputOptions)).toBe(true);
  });

  it('blocks direct terminal insertion when the current session is still outputting', () => {
    expect(
      canInsertAgentTerminalAttachments({
        sessionId: 'backend-1',
        attachmentCount: 1,
        runtimeState: 'live',
        outputState: 'outputting',
      })
    ).toBe(false);
  });

  it('queues attachment insertion when the native terminal session is still outputting', () => {
    expect(
      resolveAgentTerminalAttachmentInsertDisposition({
        sessionId: 'backend-1',
        attachmentCount: 1,
        runtimeState: 'live',
        outputState: 'outputting',
      })
    ).toBe('queue');
  });

  it('blocks direct terminal insertion when the backend session is unavailable or runtime is not live', () => {
    expect(
      canInsertAgentTerminalAttachments({
        sessionId: null,
        attachmentCount: 1,
        runtimeState: 'live',
        outputState: 'idle',
      })
    ).toBe(false);
    expect(
      canInsertAgentTerminalAttachments({
        sessionId: 'backend-1',
        attachmentCount: 1,
        runtimeState: 'reconnecting',
        outputState: 'idle',
      })
    ).toBe(false);
    expect(
      resolveAgentTerminalAttachmentInsertDisposition({
        sessionId: null,
        attachmentCount: 1,
        runtimeState: 'live',
        outputState: 'idle',
      })
    ).toBe('reject');
  });
});
