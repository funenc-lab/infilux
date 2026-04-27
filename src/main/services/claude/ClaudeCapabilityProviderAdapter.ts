import type {
  AgentCapabilityLaunchRequest,
  PrepareClaudePolicyLaunchRequest,
  SessionCreateOptions,
} from '@shared/types';
import type {
  AgentCapabilityProviderAdapter,
  PreparedAgentCapabilityLaunch,
} from '../agent/AgentCapabilityProviderAdapter';
import { listClaudeCapabilityCatalog } from './CapabilityCatalogService';
import { resolveCapabilityMcpConfigEntries } from './CapabilityMcpConfigService';
import { buildClaudeNativeMcpSessionOverrides } from './ClaudeNativeMcpSessionOverrides';
import { resolveClaudePolicy } from './ClaudePolicyResolver';
import { projectClaudeRuntimePolicy } from './ClaudeRuntimeProjector';
import type { prepareClaudeAgentLaunch } from './ClaudeSessionLaunchPreparation';

export interface ClaudeCapabilityProviderAdapterDependencies {
  prepareClaudeAgentLaunch?: typeof prepareClaudeAgentLaunch;
  listClaudeCapabilityCatalog?: typeof listClaudeCapabilityCatalog;
  resolveClaudePolicy?: typeof resolveClaudePolicy;
  resolveCapabilityMcpConfigEntries?: typeof resolveCapabilityMcpConfigEntries;
  projectClaudeRuntimePolicy?: typeof projectClaudeRuntimePolicy;
  buildClaudeNativeMcpSessionOverrides?: typeof buildClaudeNativeMcpSessionOverrides;
  now?: () => number;
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
  const prepareLaunch = dependencies.prepareClaudeAgentLaunch;
  const listCatalog = dependencies.listClaudeCapabilityCatalog ?? listClaudeCapabilityCatalog;
  const resolvePolicy = dependencies.resolveClaudePolicy ?? resolveClaudePolicy;
  const resolveMcpConfigs =
    dependencies.resolveCapabilityMcpConfigEntries ?? resolveCapabilityMcpConfigEntries;
  const projectPolicy = dependencies.projectClaudeRuntimePolicy ?? projectClaudeRuntimePolicy;
  const buildNativeMcpOverrides =
    dependencies.buildClaudeNativeMcpSessionOverrides ?? buildClaudeNativeMcpSessionOverrides;
  const now = dependencies.now ?? Date.now;

  return {
    provider: 'claude',
    async prepareLaunch(
      request: AgentCapabilityLaunchRequest,
      sessionOptions: SessionCreateOptions
    ): Promise<PreparedAgentCapabilityLaunch> {
      if (prepareLaunch) {
        const launchResult = await prepareLaunch(toClaudePolicyLaunchRequest(request));
        return {
          launchResult: {
            provider: 'claude',
            ...launchResult,
          },
        };
      }

      const catalog = await listCatalog({
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
      });
      const resolvedPolicy = resolvePolicy({
        catalog,
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
        globalPolicy: request.globalPolicy ?? null,
        projectPolicy: request.projectPolicy,
        worktreePolicy: request.worktreePolicy,
        sessionPolicy: request.sessionPolicy ?? null,
      });
      const mcpConfigs = await resolveMcpConfigs({
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
      });
      const nativeMcpProjection = buildNativeMcpOverrides(
        sessionOptions,
        resolvedPolicy,
        mcpConfigs
      );
      const projected = await projectPolicy({
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
        materializationMode: request.materializationMode,
        catalog,
        resolvedPolicy,
        projectWorkspaceMcp: !nativeMcpProjection.applied,
      });
      const warnings = [...new Set([...projected.warnings, ...nativeMcpProjection.warnings])];

      return {
        launchResult: {
          provider: 'claude',
          repoPath: request.repoPath,
          worktreePath: request.worktreePath,
          hash: resolvedPolicy.hash,
          warnings,
          resolvedPolicy,
          projected: {
            ...projected,
            warnings,
          },
          policyHash: resolvedPolicy.hash,
          appliedAt: now(),
        },
        sessionOverrides: nativeMcpProjection.sessionOverrides,
      };
    },
  };
}

export const claudeCapabilityProviderAdapter = createClaudeCapabilityProviderAdapter();
