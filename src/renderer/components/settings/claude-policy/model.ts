import type {
  ClaudeGlobalPolicy,
  ClaudePolicyConfig,
  ClaudeProjectPolicy,
  ClaudeWorktreePolicy,
} from '@shared/types';

export type ClaudePolicyBucket = 'capability' | 'sharedMcp' | 'personalMcp';
export type ClaudePolicyDecisionValue = 'inherit' | 'allow' | 'block';

const EMPTY_STRING_LIST: string[] = [];

function normalizeStringList(values: string[] | undefined): string[] {
  if (!values?.length) {
    return [];
  }

  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))].sort(
    (left, right) => left.localeCompare(right)
  );
}

export function isLegacySkillCapabilityId(id: string): boolean {
  return id.startsWith('legacy-skill:');
}

export function createEmptyClaudePolicyConfig(updatedAt = 0): ClaudePolicyConfig {
  return {
    allowedCapabilityIds: [],
    blockedCapabilityIds: [],
    allowedSharedMcpIds: [],
    blockedSharedMcpIds: [],
    allowedPersonalMcpIds: [],
    blockedPersonalMcpIds: [],
    updatedAt,
  };
}

export function createClaudePolicyDraft(
  policy: Partial<ClaudePolicyConfig> | null | undefined
): ClaudePolicyConfig {
  return {
    allowedCapabilityIds: normalizeStringList(policy?.allowedCapabilityIds),
    blockedCapabilityIds: normalizeStringList(policy?.blockedCapabilityIds),
    allowedSharedMcpIds: normalizeStringList(policy?.allowedSharedMcpIds),
    blockedSharedMcpIds: normalizeStringList(policy?.blockedSharedMcpIds),
    allowedPersonalMcpIds: normalizeStringList(policy?.allowedPersonalMcpIds),
    blockedPersonalMcpIds: normalizeStringList(policy?.blockedPersonalMcpIds),
    updatedAt:
      typeof policy?.updatedAt === 'number' && Number.isFinite(policy.updatedAt)
        ? policy.updatedAt
        : 0,
  };
}

export function createClaudeSkillPolicyDraft(
  policy: Partial<ClaudePolicyConfig> | null | undefined
): ClaudePolicyConfig {
  const normalized = createClaudePolicyDraft(policy);
  return {
    ...normalized,
    allowedCapabilityIds: normalized.allowedCapabilityIds.filter(isLegacySkillCapabilityId),
    blockedCapabilityIds: normalized.blockedCapabilityIds.filter(isLegacySkillCapabilityId),
  };
}

function equalStringLists(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function hasClaudePolicyConfigChanges(
  left: Partial<ClaudePolicyConfig> | null | undefined,
  right: Partial<ClaudePolicyConfig> | null | undefined
): boolean {
  const normalizedLeft = createClaudePolicyDraft(left);
  const normalizedRight = createClaudePolicyDraft(right);

  return !(
    equalStringLists(normalizedLeft.allowedCapabilityIds, normalizedRight.allowedCapabilityIds) &&
    equalStringLists(normalizedLeft.blockedCapabilityIds, normalizedRight.blockedCapabilityIds) &&
    equalStringLists(normalizedLeft.allowedSharedMcpIds, normalizedRight.allowedSharedMcpIds) &&
    equalStringLists(normalizedLeft.blockedSharedMcpIds, normalizedRight.blockedSharedMcpIds) &&
    equalStringLists(normalizedLeft.allowedPersonalMcpIds, normalizedRight.allowedPersonalMcpIds) &&
    equalStringLists(normalizedLeft.blockedPersonalMcpIds, normalizedRight.blockedPersonalMcpIds)
  );
}

export function hasClaudeSkillPolicyConfigChanges(
  left: Partial<ClaudePolicyConfig> | null | undefined,
  right: Partial<ClaudePolicyConfig> | null | undefined
): boolean {
  return hasClaudePolicyConfigChanges(
    createClaudeSkillPolicyDraft(left),
    createClaudeSkillPolicyDraft(right)
  );
}

export function isClaudePolicyConfigEmpty(
  policy: Partial<ClaudePolicyConfig> | null | undefined
): boolean {
  const normalized = createClaudePolicyDraft(policy);
  return (
    normalized.allowedCapabilityIds.length === 0 &&
    normalized.blockedCapabilityIds.length === 0 &&
    normalized.allowedSharedMcpIds.length === 0 &&
    normalized.blockedSharedMcpIds.length === 0 &&
    normalized.allowedPersonalMcpIds.length === 0 &&
    normalized.blockedPersonalMcpIds.length === 0
  );
}

function getPolicyLists(policy: ClaudePolicyConfig, bucket: ClaudePolicyBucket) {
  if (bucket === 'capability') {
    return {
      allowed: policy.allowedCapabilityIds,
      blocked: policy.blockedCapabilityIds,
    };
  }

  if (bucket === 'sharedMcp') {
    return {
      allowed: policy.allowedSharedMcpIds,
      blocked: policy.blockedSharedMcpIds,
    };
  }

  return {
    allowed: policy.allowedPersonalMcpIds,
    blocked: policy.blockedPersonalMcpIds,
  };
}

export function getClaudePolicyDecision(
  policy: Partial<ClaudePolicyConfig> | null | undefined,
  bucket: ClaudePolicyBucket,
  id: string
): ClaudePolicyDecisionValue {
  const normalized = createClaudePolicyDraft(policy);
  const lists = getPolicyLists(normalized, bucket);

  if (lists.blocked.includes(id)) {
    return 'block';
  }
  if (lists.allowed.includes(id)) {
    return 'allow';
  }
  return 'inherit';
}

function updateDecisionList(values: string[], id: string, include: boolean): string[] {
  const next = new Set(values);
  if (include) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return [...next].sort((left, right) => left.localeCompare(right));
}

function sortStringSet(values: Set<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function setClaudePolicyDecision(
  policy: Partial<ClaudePolicyConfig> | null | undefined,
  bucket: ClaudePolicyBucket,
  id: string,
  decision: ClaudePolicyDecisionValue
): ClaudePolicyConfig {
  const current = createClaudePolicyDraft(policy);
  const allowedIds = getPolicyLists(current, bucket).allowed;
  const blockedIds = getPolicyLists(current, bucket).blocked;
  const nextAllowedIds = updateDecisionList(allowedIds, id, decision === 'allow');
  const nextBlockedIds = updateDecisionList(blockedIds, id, decision === 'block');

  if (bucket === 'capability') {
    return {
      ...current,
      allowedCapabilityIds: nextAllowedIds,
      blockedCapabilityIds: nextBlockedIds,
    };
  }

  if (bucket === 'sharedMcp') {
    return {
      ...current,
      allowedSharedMcpIds: nextAllowedIds,
      blockedSharedMcpIds: nextBlockedIds,
    };
  }

  return {
    ...current,
    allowedPersonalMcpIds: nextAllowedIds,
    blockedPersonalMcpIds: nextBlockedIds,
  };
}

export function setClaudePolicyDecisionForIds(
  policy: Partial<ClaudePolicyConfig> | null | undefined,
  bucket: ClaudePolicyBucket,
  ids: string[],
  decision: ClaudePolicyDecisionValue
): ClaudePolicyConfig {
  const normalizedIds = normalizeStringList(ids);
  if (normalizedIds.length === 0) {
    return createClaudePolicyDraft(policy);
  }

  const current = createClaudePolicyDraft(policy);
  const allowedIds = new Set(getPolicyLists(current, bucket).allowed);
  const blockedIds = new Set(getPolicyLists(current, bucket).blocked);

  for (const id of normalizedIds) {
    allowedIds.delete(id);
    blockedIds.delete(id);

    if (decision === 'allow') {
      allowedIds.add(id);
    } else if (decision === 'block') {
      blockedIds.add(id);
    }
  }

  const nextAllowedIds = sortStringSet(allowedIds);
  const nextBlockedIds = sortStringSet(blockedIds);

  if (bucket === 'capability') {
    return {
      ...current,
      allowedCapabilityIds: nextAllowedIds,
      blockedCapabilityIds: nextBlockedIds,
    };
  }

  if (bucket === 'sharedMcp') {
    return {
      ...current,
      allowedSharedMcpIds: nextAllowedIds,
      blockedSharedMcpIds: nextBlockedIds,
    };
  }

  return {
    ...current,
    allowedPersonalMcpIds: nextAllowedIds,
    blockedPersonalMcpIds: nextBlockedIds,
  };
}

export function buildClaudeProjectPolicy(
  repoPath: string,
  policy: Partial<ClaudePolicyConfig> | null | undefined
): ClaudeProjectPolicy | null {
  const normalized = createClaudePolicyDraft(policy);
  if (isClaudePolicyConfigEmpty(normalized)) {
    return null;
  }

  return {
    repoPath,
    ...normalized,
    updatedAt: Date.now(),
  };
}

export function buildClaudeGlobalPolicy(
  policy: Partial<ClaudePolicyConfig> | null | undefined
): ClaudeGlobalPolicy | null {
  const normalized = createClaudePolicyDraft(policy);
  if (isClaudePolicyConfigEmpty(normalized)) {
    return null;
  }

  return {
    ...normalized,
    updatedAt: Date.now(),
  };
}

export function buildClaudeWorktreePolicy(
  repoPath: string,
  worktreePath: string,
  policy: Partial<ClaudePolicyConfig> | null | undefined
): ClaudeWorktreePolicy | null {
  const normalized = createClaudePolicyDraft(policy);
  if (isClaudePolicyConfigEmpty(normalized)) {
    return null;
  }

  return {
    repoPath,
    worktreePath,
    ...normalized,
    updatedAt: Date.now(),
  };
}

export function getClaudePolicySelectionCount(
  policy: Partial<ClaudePolicyConfig> | null | undefined,
  bucket: ClaudePolicyBucket
): {
  allowed: number;
  blocked: number;
} {
  const normalized = createClaudePolicyDraft(policy);
  const lists = getPolicyLists(normalized, bucket);
  const allowed =
    bucket === 'capability' ? lists.allowed.filter(isLegacySkillCapabilityId) : lists.allowed;
  const blocked =
    bucket === 'capability' ? lists.blocked.filter(isLegacySkillCapabilityId) : lists.blocked;
  return {
    allowed: allowed.length,
    blocked: blocked.length,
  };
}

export function getClaudePolicySummaryItems(
  policy: Partial<ClaudePolicyConfig> | null | undefined
): Array<{
  key: ClaudePolicyBucket;
  label: string;
  allowed: number;
  blocked: number;
}> {
  return [
    {
      key: 'capability',
      label: 'Skills',
      ...getClaudePolicySelectionCount(policy, 'capability'),
    },
    {
      key: 'sharedMcp',
      label: 'Shared MCP',
      ...getClaudePolicySelectionCount(policy, 'sharedMcp'),
    },
    {
      key: 'personalMcp',
      label: 'Personal MCP',
      ...getClaudePolicySelectionCount(policy, 'personalMcp'),
    },
  ];
}

export function getEmptyStringList(): string[] {
  return EMPTY_STRING_LIST;
}
