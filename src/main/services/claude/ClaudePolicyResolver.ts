import { createHash } from 'node:crypto';
import type {
  ClaudeCapabilityCatalog,
  ClaudeGlobalPolicy,
  ClaudePolicyConfig,
  ClaudePolicyProvenance,
  ClaudeProjectPolicy,
  ClaudeWorktreePolicy,
  ResolvedClaudePolicy,
} from '@shared/types';

interface ApplyAllowBlockResult {
  allowedIds: string[];
  blockedIds: string[];
  provenance: Record<string, ClaudePolicyProvenance>;
}

type PolicyDecision = 'allow' | 'block';

interface ScopedDecisionSets {
  source: ClaudePolicyProvenance['source'];
  allowed: Set<string>;
  blocked: Set<string>;
}

function sortStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function applyAllowBlock(params: {
  availableIds: string[];
  globalAllowedIds: string[];
  globalBlockedIds: string[];
  projectAllowedIds: string[];
  projectBlockedIds: string[];
  worktreeAllowedIds: string[];
  worktreeBlockedIds: string[];
  sessionAllowedIds: string[];
  sessionBlockedIds: string[];
}): ApplyAllowBlockResult {
  const availableIds = new Set(params.availableIds);
  const scopedDecisions: ScopedDecisionSets[] = [
    {
      source: 'global-policy',
      allowed: new Set(params.globalAllowedIds.filter((id) => availableIds.has(id))),
      blocked: new Set(params.globalBlockedIds.filter((id) => availableIds.has(id))),
    },
    {
      source: 'project-policy',
      allowed: new Set(params.projectAllowedIds.filter((id) => availableIds.has(id))),
      blocked: new Set(params.projectBlockedIds.filter((id) => availableIds.has(id))),
    },
    {
      source: 'worktree-policy',
      allowed: new Set(params.worktreeAllowedIds.filter((id) => availableIds.has(id))),
      blocked: new Set(params.worktreeBlockedIds.filter((id) => availableIds.has(id))),
    },
    {
      source: 'session-policy',
      allowed: new Set(params.sessionAllowedIds.filter((id) => availableIds.has(id))),
      blocked: new Set(params.sessionBlockedIds.filter((id) => availableIds.has(id))),
    },
  ];

  const allowedIds: string[] = [];
  const blockedIds: string[] = [];
  const provenance: Record<string, ClaudePolicyProvenance> = {};

  for (const id of sortStrings(availableIds)) {
    let decision: PolicyDecision = 'allow';
    let source: ClaudePolicyProvenance['source'] = 'catalog';

    for (const scope of scopedDecisions) {
      if (scope.blocked.has(id)) {
        decision = 'block';
        source = scope.source;
        continue;
      }
      if (scope.allowed.has(id)) {
        decision = 'allow';
        source = scope.source;
      }
    }

    if (decision === 'allow') {
      allowedIds.push(id);
    } else {
      blockedIds.push(id);
    }

    provenance[id] = { source, decision };
  }

  return {
    allowedIds,
    blockedIds,
    provenance,
  };
}

export function buildResolvedCapabilityMap(params: {
  catalog: ClaudeCapabilityCatalog;
  globalPolicy: ClaudeGlobalPolicy | null;
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
  sessionPolicy: ClaudePolicyConfig | null;
}): ApplyAllowBlockResult {
  return applyAllowBlock({
    availableIds: params.catalog.capabilities.map((item) => item.id),
    globalAllowedIds: params.globalPolicy?.allowedCapabilityIds ?? [],
    globalBlockedIds: params.globalPolicy?.blockedCapabilityIds ?? [],
    projectAllowedIds: params.projectPolicy?.allowedCapabilityIds ?? [],
    projectBlockedIds: params.projectPolicy?.blockedCapabilityIds ?? [],
    worktreeAllowedIds: params.worktreePolicy?.allowedCapabilityIds ?? [],
    worktreeBlockedIds: params.worktreePolicy?.blockedCapabilityIds ?? [],
    sessionAllowedIds: params.sessionPolicy?.allowedCapabilityIds ?? [],
    sessionBlockedIds: params.sessionPolicy?.blockedCapabilityIds ?? [],
  });
}

export function buildResolvedMcpMap(params: {
  availableIds: string[];
  globalAllowedIds: string[];
  globalBlockedIds: string[];
  projectAllowedIds: string[];
  projectBlockedIds: string[];
  worktreeAllowedIds: string[];
  worktreeBlockedIds: string[];
  sessionAllowedIds: string[];
  sessionBlockedIds: string[];
}): ApplyAllowBlockResult {
  return applyAllowBlock(params);
}

export function createResolvedPolicyHash(result: {
  repoPath: string;
  worktreePath: string;
  allowedCapabilityIds: string[];
  blockedCapabilityIds: string[];
  allowedSharedMcpIds: string[];
  blockedSharedMcpIds: string[];
  allowedPersonalMcpIds: string[];
  blockedPersonalMcpIds: string[];
  capabilityProvenance: Record<string, ClaudePolicyProvenance>;
  sharedMcpProvenance: Record<string, ClaudePolicyProvenance>;
  personalMcpProvenance: Record<string, ClaudePolicyProvenance>;
}): string {
  const payload = {
    repoPath: result.repoPath,
    worktreePath: result.worktreePath,
    allowedCapabilityIds: sortStrings(result.allowedCapabilityIds),
    blockedCapabilityIds: sortStrings(result.blockedCapabilityIds),
    allowedSharedMcpIds: sortStrings(result.allowedSharedMcpIds),
    blockedSharedMcpIds: sortStrings(result.blockedSharedMcpIds),
    allowedPersonalMcpIds: sortStrings(result.allowedPersonalMcpIds),
    blockedPersonalMcpIds: sortStrings(result.blockedPersonalMcpIds),
    capabilityProvenance: Object.fromEntries(
      Object.entries(result.capabilityProvenance).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    sharedMcpProvenance: Object.fromEntries(
      Object.entries(result.sharedMcpProvenance).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    personalMcpProvenance: Object.fromEntries(
      Object.entries(result.personalMcpProvenance).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function resolveClaudePolicy(params: {
  catalog: ClaudeCapabilityCatalog;
  repoPath: string;
  worktreePath: string;
  globalPolicy?: ClaudeGlobalPolicy | null;
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
  sessionPolicy?: ClaudePolicyConfig | null;
}): ResolvedClaudePolicy {
  const capabilityResult = buildResolvedCapabilityMap({
    catalog: params.catalog,
    globalPolicy: params.globalPolicy ?? null,
    projectPolicy: params.projectPolicy,
    worktreePolicy: params.worktreePolicy,
    sessionPolicy: params.sessionPolicy ?? null,
  });
  const sharedMcpResult = buildResolvedMcpMap({
    availableIds: params.catalog.sharedMcpServers.map((item) => item.id),
    globalAllowedIds: params.globalPolicy?.allowedSharedMcpIds ?? [],
    globalBlockedIds: params.globalPolicy?.blockedSharedMcpIds ?? [],
    projectAllowedIds: params.projectPolicy?.allowedSharedMcpIds ?? [],
    projectBlockedIds: params.projectPolicy?.blockedSharedMcpIds ?? [],
    worktreeAllowedIds: params.worktreePolicy?.allowedSharedMcpIds ?? [],
    worktreeBlockedIds: params.worktreePolicy?.blockedSharedMcpIds ?? [],
    sessionAllowedIds: params.sessionPolicy?.allowedSharedMcpIds ?? [],
    sessionBlockedIds: params.sessionPolicy?.blockedSharedMcpIds ?? [],
  });
  const personalMcpResult = buildResolvedMcpMap({
    availableIds: params.catalog.personalMcpServers.map((item) => item.id),
    globalAllowedIds: params.globalPolicy?.allowedPersonalMcpIds ?? [],
    globalBlockedIds: params.globalPolicy?.blockedPersonalMcpIds ?? [],
    projectAllowedIds: params.projectPolicy?.allowedPersonalMcpIds ?? [],
    projectBlockedIds: params.projectPolicy?.blockedPersonalMcpIds ?? [],
    worktreeAllowedIds: params.worktreePolicy?.allowedPersonalMcpIds ?? [],
    worktreeBlockedIds: params.worktreePolicy?.blockedPersonalMcpIds ?? [],
    sessionAllowedIds: params.sessionPolicy?.allowedPersonalMcpIds ?? [],
    sessionBlockedIds: params.sessionPolicy?.blockedPersonalMcpIds ?? [],
  });

  const hash = createResolvedPolicyHash({
    repoPath: params.repoPath,
    worktreePath: params.worktreePath,
    allowedCapabilityIds: capabilityResult.allowedIds,
    blockedCapabilityIds: capabilityResult.blockedIds,
    allowedSharedMcpIds: sharedMcpResult.allowedIds,
    blockedSharedMcpIds: sharedMcpResult.blockedIds,
    allowedPersonalMcpIds: personalMcpResult.allowedIds,
    blockedPersonalMcpIds: personalMcpResult.blockedIds,
    capabilityProvenance: capabilityResult.provenance,
    sharedMcpProvenance: sharedMcpResult.provenance,
    personalMcpProvenance: personalMcpResult.provenance,
  });

  return {
    repoPath: params.repoPath,
    worktreePath: params.worktreePath,
    allowedCapabilityIds: capabilityResult.allowedIds,
    blockedCapabilityIds: capabilityResult.blockedIds,
    allowedSharedMcpIds: sharedMcpResult.allowedIds,
    blockedSharedMcpIds: sharedMcpResult.blockedIds,
    allowedPersonalMcpIds: personalMcpResult.allowedIds,
    blockedPersonalMcpIds: personalMcpResult.blockedIds,
    capabilityProvenance: capabilityResult.provenance,
    sharedMcpProvenance: sharedMcpResult.provenance,
    personalMcpProvenance: personalMcpResult.provenance,
    hash,
    policyHash: hash,
  };
}
