import type {
  AgentCapabilityLaunchRequest,
  PrepareClaudePolicyLaunchRequest,
  SessionCreateOptions,
} from '@shared/types';
import type {
  AgentCapabilityProviderAdapter,
  PreparedAgentCapabilityLaunch,
} from '../agent/AgentCapabilityProviderAdapter';
import { prepareClaudeAgentLaunch } from './ClaudeSessionLaunchPreparation';

export interface ClaudeCapabilityProviderAdapterDependencies {
  prepareClaudeAgentLaunch?: typeof prepareClaudeAgentLaunch;
}

function toClaudePolicyLaunchRequest(
  request: AgentCapabilityLaunchRequest
): PrepareClaudePolicyLaunchRequest {
  return {
    agentId: request.agentId,
    agentCommand: request.agentCommand,
    repoPath: request.repoPath,
    worktreePath: request.worktreePath,
    globalPolicy: request.globalPolicy ?? null,
    projectPolicy: request.projectPolicy,
    worktreePolicy: request.worktreePolicy,
    sessionPolicy: request.sessionPolicy ?? null,
    materializationMode: request.materializationMode,
  };
}

export function createClaudeCapabilityProviderAdapter(
  dependencies: ClaudeCapabilityProviderAdapterDependencies = {}
): AgentCapabilityProviderAdapter {
  const prepareLaunch = dependencies.prepareClaudeAgentLaunch ?? prepareClaudeAgentLaunch;

  return {
    provider: 'claude',
    async prepareLaunch(
      request: AgentCapabilityLaunchRequest,
      _sessionOptions: SessionCreateOptions
    ): Promise<PreparedAgentCapabilityLaunch> {
      const launchResult = await prepareLaunch(toClaudePolicyLaunchRequest(request));
      return {
        launchResult: {
          provider: 'claude',
          ...launchResult,
        },
      };
    },
  };
}

export const claudeCapabilityProviderAdapter = createClaudeCapabilityProviderAdapter();
