import type { PersistentAgentSessionRecord } from '@shared/types';
import {
  withPersistentAgentReplaySnapshot,
  withPersistentAgentSessionTitleMetadata,
} from '@shared/utils/persistentAgentSession';
import type { RendererEnvironment } from '@/lib/electronEnvironment';
import { resolvePersistentProviderSessionId } from './agentProviderSessionIdentity';
import { resolveSessionPersistentHostSessionKey } from './persistentHostSession';
import type { Session } from './SessionBar';
import { resolveSessionTitleState } from './sessionTitlePolicy';

export function buildPersistentAgentSessionRecord(
  session: Session,
  environment: RendererEnvironment
): PersistentAgentSessionRecord {
  const { platform, runtimeChannel } = environment;
  const createdAt = session.createdAt ?? Date.now();
  const hostSessionKey = resolveSessionPersistentHostSessionKey({
    session,
    platform,
    runtimeChannel,
  });
  const titleState = resolveSessionTitleState({
    agentId: session.agentId,
    currentName: session.name,
    defaultName: session.defaultName,
    titleSource: session.titleSource,
    userRenamed: session.userRenamed,
  });
  const titleMetadata = withPersistentAgentSessionTitleMetadata(undefined, {
    defaultName: session.defaultName,
    titleSource: titleState.titleSource,
    userRenamed: titleState.titleSource === 'manual' ? true : undefined,
  });

  return {
    uiSessionId: session.id,
    backendSessionId: session.backendSessionId,
    providerSessionId: resolvePersistentProviderSessionId({
      agentCommand: session.agentCommand,
      uiSessionId: session.id,
      providerSessionId: session.sessionId,
      hostSessionKey,
      providerSessionIdentityValid: session.providerSessionIdentityValid,
    }),
    agentId: session.agentId,
    agentCommand: session.agentCommand,
    customPath: session.customPath,
    customArgs: session.customArgs,
    environment: session.environment || 'native',
    repoPath: session.repoPath,
    cwd: session.cwd,
    displayName: titleState.name,
    activated: Boolean(session.activated),
    initialized: session.initialized,
    hostKind: platform === 'win32' ? 'supervisor' : 'tmux',
    hostSessionKey,
    recoveryPolicy: 'auto',
    createdAt,
    updatedAt: Date.now(),
    lastKnownState: session.recoveryState ?? 'live',
    metadata: withPersistentAgentReplaySnapshot(
      titleMetadata,
      session.replaySnapshot,
      session.replaySnapshotCapturedAt
    ),
  };
}
