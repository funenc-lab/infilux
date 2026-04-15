import type {
  AgentCapabilityLaunchRequest,
  ClaudeGlobalPolicy,
  ClaudePolicyConfig,
  ClaudePolicyMaterializationMode,
  ClaudeProjectPolicy,
  ClaudeWorktreePolicy,
  PrepareClaudePolicyLaunchRequest,
} from '@shared/types';
import {
  resolveClaudeCapabilityPolicyMaterializationMode,
  supportsClaudeCapabilityPolicyLaunch,
} from '@shared/utils/agentCapabilityPolicy';
import { pathsEqual } from '@/App/storage';
import {
  buildAgentCapabilityLaunchMetadata,
  buildAgentCapabilityLaunchRequest,
} from './agentCapabilityLaunch';
import type { Session } from './SessionBar';

interface BuildClaudePolicyLaunchMetadataParams {
  agentId?: string;
  agentCommand?: string;
  repoPath?: string;
  worktreePath?: string;
  globalPolicy?: ClaudeGlobalPolicy | null;
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
  sessionPolicy?: ClaudePolicyConfig | null;
  materializationMode?: ClaudePolicyMaterializationMode;
  metadata?: Record<string, unknown>;
}

interface ExtractedClaudePolicySessionMetadata {
  hash: string;
  warnings: string[];
}

export function isClaudePolicyAgentCommand(agentCommand?: string, agentId?: string): boolean {
  return supportsClaudeCapabilityPolicyLaunch(agentId, agentCommand);
}

export function resolveClaudePolicyMaterializationMode(
  agentCommand?: string,
  agentId?: string
): ClaudePolicyMaterializationMode {
  return resolveClaudeCapabilityPolicyMaterializationMode(agentId, agentCommand);
}

export function buildClaudePolicyLaunchRequest(
  params: BuildClaudePolicyLaunchMetadataParams
): PrepareClaudePolicyLaunchRequest | null {
  const launchRequest = buildAgentCapabilityLaunchRequest(params);
  if (!launchRequest || launchRequest.provider !== 'claude') {
    return null;
  }

  return toClaudePolicyLaunchRequest(launchRequest);
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

export function buildClaudePolicyLaunchMetadata(
  params: BuildClaudePolicyLaunchMetadataParams
): Record<string, unknown> | undefined {
  const launchRequest = buildClaudePolicyLaunchRequest(params);
  if (!launchRequest) {
    return params.metadata;
  }

  return {
    ...(buildAgentCapabilityLaunchMetadata(params) ?? {}),
    claudePolicyLaunch: launchRequest,
  };
}

export function extractClaudePolicySessionMetadata(
  metadata: Record<string, unknown> | undefined
): ExtractedClaudePolicySessionMetadata | null {
  const candidate = metadata?.claudePolicy;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const hash =
    typeof (candidate as { hash?: unknown }).hash === 'string'
      ? (candidate as { hash: string }).hash
      : '';
  if (!hash) {
    return null;
  }

  const warnings = Array.isArray((candidate as { warnings?: unknown }).warnings)
    ? (candidate as { warnings: unknown[] }).warnings.filter(
        (warning): warning is string => typeof warning === 'string'
      )
    : [];

  return {
    hash,
    warnings,
  };
}

export function shouldMarkClaudePolicySessionStale(
  session: Session,
  params:
    | {
        scope: 'global';
      }
    | {
        scope: 'repo';
        repoPath: string;
      }
    | {
        scope: 'worktree';
        repoPath: string;
        worktreePath: string;
      }
): boolean {
  if (
    !isClaudePolicyAgentCommand(session.agentCommand, session.agentId) ||
    !session.claudePolicyHash ||
    session.recoveryState === 'dead'
  ) {
    return false;
  }

  if (params.scope === 'global') {
    return true;
  }

  if (!pathsEqual(session.repoPath, params.repoPath)) {
    return false;
  }

  if (params.scope === 'repo') {
    return true;
  }

  return pathsEqual(session.cwd, params.worktreePath);
}
