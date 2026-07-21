import { extractPersistentAgentSessionTitleMetadata } from '@shared/utils/persistentAgentSession';
import { describe, expect, it } from 'vitest';
import type { RendererEnvironment } from '@/lib/electronEnvironment';
import { buildPersistentAgentSessionRecord } from '../agentSessionPersistenceRecord';
import type { Session } from '../SessionBar';

const environment: RendererEnvironment = {
  HOME: '/home/test',
  platform: 'linux',
  appVersion: '1.0.0',
  runtimeChannel: 'prod',
};

describe('buildPersistentAgentSessionRecord', () => {
  it('preserves canonical title provenance and replay metadata', () => {
    const session: Session = {
      id: 'session-1',
      sessionId: 'provider-1',
      providerSessionIdentityValid: true,
      createdAt: 10,
      name: 'Custom title',
      defaultName: 'Custom Agent',
      titleSource: 'manual',
      userRenamed: true,
      agentId: 'custom-agent',
      agentCommand: 'custom-agent',
      initialized: true,
      activated: true,
      persistenceEnabled: true,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      replaySnapshot: 'terminal output',
      replaySnapshotCapturedAt: 20,
    };

    const record = buildPersistentAgentSessionRecord(session, environment);

    expect(record).toEqual(
      expect.objectContaining({
        uiSessionId: 'session-1',
        providerSessionId: 'provider-1',
        displayName: 'Custom title',
        createdAt: 10,
        hostKind: 'tmux',
      })
    );
    expect(extractPersistentAgentSessionTitleMetadata(record.metadata)).toEqual({
      defaultName: 'Custom Agent',
      titleSource: 'manual',
      userRenamed: true,
    });
    expect(record.metadata).toEqual(
      expect.objectContaining({
        persistentAgentSession: expect.objectContaining({
          replaySnapshot: 'terminal output',
          replaySnapshotCapturedAt: 20,
        }),
      })
    );
  });

  it('records a default title source when legacy session provenance is missing', () => {
    const session: Session = {
      id: 'legacy-custom-session',
      name: 'Custom Agent (Hapi)',
      agentId: 'custom-agent-hapi',
      agentCommand: 'custom-agent',
      initialized: true,
      activated: true,
      persistenceEnabled: true,
      repoPath: '/repo',
      cwd: '/repo/worktree',
    };

    const record = buildPersistentAgentSessionRecord(session, environment);

    expect(extractPersistentAgentSessionTitleMetadata(record.metadata)).toEqual({
      titleSource: 'default',
    });
  });
});
