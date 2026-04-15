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
  const globalAllowedIds = new Set(params.globalAllowedIds.filter((id) => availableIds.has(id)));
  const globalBlockedIds = new Set(params.globalBlockedIds.filter((id) => availableIds.has(id)));
  const projectAllowedIds = new Set(params.projectAllowedIds.filter((id) => availableIds.has(id)));
  const worktreeAllowedIds = new Set(
    params.worktreeAllowedIds.filter((id) => availableIds.has(id))
  );
  const projectBlockedIds = new Set(params.projectBlockedIds.filter((id) => availableIds.has(id)));
  const worktreeBlockedIds = new Set(
    params.worktreeBlockedIds.filter((id) => availableIds.has(id))
  );
  const sessionAllowedIds = new Set(params.sessionAllowedIds.filter((id) => availableIds.has(id)));
  const sessionBlockedIds = new Set(params.sessionBlockedIds.filter((id) => availableIds.has(id)));

  const baseAllowedIds =
    globalAllowedIds.size > 0 ? new Set(globalAllowedIds) : new Set(availableIds);
  if (projectAllowedIds.size > 0) {
    baseAllowedIds.clear();
    for (const id of projectAllowedIds) {
      baseAllowedIds.add(id);
    }
  }
  for (const id of worktreeAllowedIds) {
    baseAllowedIds.add(id);
  }
  for (const id of sessionAllowedIds) {
    baseAllowedIds.add(id);
  }

  const blockedIds = new Set<string>([
    ...globalBlockedIds,
    ...projectBlockedIds,
    ...worktreeBlockedIds,
    ...sessionBlockedIds,
  ]);
  const allowedIds = [...baseAllowedIds].filter((id) => !blockedIds.has(id));

  const provenance: Record<string, ClaudePolicyProvenance> = {};
  for (const id of blockedIds) {
    provenance[id] = sessionBlockedIds.has(id)
      ? { source: 'session-policy', decision: 'block' }
      : worktreeBlockedIds.has(id)
        ? { source: 'worktree-policy', decision: 'block' }
        : projectBlockedIds.has(id)
          ? { source: 'project-policy', decision: 'block' }
          : { source: 'global-policy', decision: 'block' };
  }
  for (const id of allowedIds) {
    if (provenance[id]) {
      continue;
    }
    if (sessionAllowedIds.has(id)) {
      provenance[id] = { source: 'session-policy', decision: 'allow' };
      continue;
    }
    if (worktreeAllowedIds.has(id)) {
      provenance[id] = { source: 'worktree-policy', decision: 'allow' };
      continue;
    }
    if (projectAllowedIds.size > 0) {
      provenance[id] = { source: 'project-policy', decision: 'allow' };
      continue;
    }
    if (globalAllowedIds.size > 0) {
      provenance[id] = { source: 'global-policy', decision: 'allow' };
      continue;
    }
    provenance[id] = { source: 'catalog', decision: 'allow' };
  }

  return {
    allowedIds: sortStrings(allowedIds),
    blockedIds: sortStrings(blockedIds),
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
