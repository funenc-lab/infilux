import type {
  AgentCapabilityLaunchRequest,
  AgentCapabilityLaunchResult,
  AgentCapabilityProvider,
  SessionCreateOptions,
} from '@shared/types';

export interface AgentCapabilitySessionOverrides {
  spawnCwd?: SessionCreateOptions['spawnCwd'];
  shell?: SessionCreateOptions['shell'];
  args?: SessionCreateOptions['args'];
  fallbackShell?: SessionCreateOptions['fallbackShell'];
  fallbackArgs?: SessionCreateOptions['fallbackArgs'];
  env?: SessionCreateOptions['env'];
  initialCommand?: SessionCreateOptions['initialCommand'];
  metadata?: Record<string, unknown>;
}

export interface PreparedAgentCapabilityLaunch {
  launchResult: AgentCapabilityLaunchResult;
  sessionOverrides?: AgentCapabilitySessionOverrides;
}

export interface AgentCapabilityProviderAdapter {
  readonly provider: AgentCapabilityProvider;
  prepareLaunch(
    request: AgentCapabilityLaunchRequest,
    sessionOptions: SessionCreateOptions
  ): Promise<PreparedAgentCapabilityLaunch | null>;
}
