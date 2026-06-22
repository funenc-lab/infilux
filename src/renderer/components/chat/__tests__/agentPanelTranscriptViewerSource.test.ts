import { describe, expect, it } from 'vitest';
import { agentPanelSource } from './agentPanelSource';

describe('AgentPanel transcript viewer wiring', () => {
  it('exposes the retained transcript viewer from the active session toolbar', () => {
    expect(agentPanelSource).toContain('AgentSessionTranscriptDrawer');
    expect(agentPanelSource).toContain('setTranscriptSessionId');
    expect(agentPanelSource).toContain("t('Transcript')");
  });

  it('keeps live replay snapshots out of high-frequency global session updates', () => {
    expect(agentPanelSource).toContain('createAgentReplaySnapshotStore');
    expect(agentPanelSource).toContain('handleReplaySnapshotChange');
    expect(agentPanelSource).toContain('commitPendingReplaySnapshot(sessionId)');
    expect(agentPanelSource).toContain('replaySnapshotStore={replaySnapshotStore}');
    expect(agentPanelSource).not.toContain(
      `onReplaySnapshotChange={(replaySnapshot, replaySnapshotCapturedAt) => {
              if (
                session.replaySnapshot === replaySnapshot &&
                session.replaySnapshotCapturedAt === replaySnapshotCapturedAt
              ) {
                return;
              }
              updateSession(sessionId, {
                replaySnapshot,
                replaySnapshotCapturedAt,
              });
            }}`
    );
  });
});
