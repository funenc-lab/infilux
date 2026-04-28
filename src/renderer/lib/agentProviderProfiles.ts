import type { ClaudeProvider, ClaudeSettings } from '@shared/types';
import { getAgentInputBaseId } from '@shared/utils/agentInputMode';
import {
  clearClaudeProviderSwitch,
  consumeClaudeProviderSwitch,
  isClaudeProviderMatch,
  markClaudeProviderSwitch,
} from './claudeProvider';

export interface AgentProviderProfile {
  id: string;
  name: string;
  displayOrder?: number;
  enabled?: boolean;
}

export interface AgentProviderProfileSnapshot<TProfile extends AgentProviderProfile, TSettings> {
  settings: TSettings | null;
  extracted: Partial<TProfile> | null;
}

export interface AgentProviderProfileSession {
  agentId?: string;
  agentCommand?: string;
}

export interface AgentProviderProfileAdapter<TProfile extends AgentProviderProfile, TSettings> {
  id: string;
  queryKey: (repoPath?: string) => readonly unknown[];
  readCurrent: (repoPath?: string) => Promise<AgentProviderProfileSnapshot<TProfile, TSettings>>;
  subscribeToExternalChanges: (
    repoPath: string | undefined,
    callback: (snapshot: AgentProviderProfileSnapshot<TProfile, TSettings>) => void
  ) => () => void;
  apply: (repoPath: string | undefined, profile: TProfile) => Promise<boolean>;
  isActiveProfile: (profile: TProfile, current?: Partial<TProfile> | null) => boolean;
  supportsSession: (session?: AgentProviderProfileSession | null) => boolean;
  markSwitch: (profile: TProfile) => void;
  consumeSwitch: (current?: Partial<TProfile> | null) => boolean;
  clearSwitch: () => void;
  buildPreview: (settings?: TSettings | null) => unknown;
}

interface ClaudeCodeProviderBridge {
  readSettings: (
    repoPath?: string
  ) => Promise<AgentProviderProfileSnapshot<ClaudeProvider, ClaudeSettings>>;
  apply: (repoPath: string | undefined, provider: ClaudeProvider) => Promise<boolean>;
  onSettingsChanged: (
    callback: (snapshot: AgentProviderProfileSnapshot<ClaudeProvider, ClaudeSettings>) => void
  ) => () => void;
}

export function buildClaudeCodeProviderPreview(settings?: ClaudeSettings | null): unknown {
  return {
    env: {
      ANTHROPIC_BASE_URL: settings?.env?.ANTHROPIC_BASE_URL,
      ANTHROPIC_AUTH_TOKEN: settings?.env?.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_DEFAULT_SONNET_MODEL: settings?.env?.ANTHROPIC_DEFAULT_SONNET_MODEL,
      ANTHROPIC_DEFAULT_OPUS_MODEL: settings?.env?.ANTHROPIC_DEFAULT_OPUS_MODEL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: settings?.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    },
  };
}

export function supportsClaudeCodeProviderSession(
  session?: AgentProviderProfileSession | null
): boolean {
  if (!session) {
    return true;
  }

  const candidates = [session.agentId, session.agentCommand].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  if (candidates.length === 0) {
    return true;
  }

  return candidates.some((value) => getAgentInputBaseId(value) === 'claude');
}

export function createClaudeCodeProviderProfileAdapter(
  bridge: ClaudeCodeProviderBridge
): AgentProviderProfileAdapter<ClaudeProvider, ClaudeSettings> {
  return {
    id: 'claude-code',
    queryKey: (repoPath?: string) =>
      ['agent-provider-settings', 'claude-code', repoPath ?? null] as const,
    readCurrent: (repoPath?: string) => bridge.readSettings(repoPath),
    subscribeToExternalChanges: (_repoPath, callback) => bridge.onSettingsChanged(callback),
    apply: (repoPath, provider) => bridge.apply(repoPath, provider),
    isActiveProfile: isClaudeProviderMatch,
    supportsSession: supportsClaudeCodeProviderSession,
    markSwitch: markClaudeProviderSwitch,
    consumeSwitch: consumeClaudeProviderSwitch,
    clearSwitch: clearClaudeProviderSwitch,
    buildPreview: buildClaudeCodeProviderPreview,
  };
}

export const agentProviderProfileAdapter = createClaudeCodeProviderProfileAdapter({
  readSettings: (repoPath) => window.electronAPI.agentProvider.readSettings(repoPath),
  apply: (repoPath, provider) => window.electronAPI.agentProvider.apply(repoPath, provider),
  onSettingsChanged: (callback) => window.electronAPI.agentProvider.onSettingsChanged(callback),
});
