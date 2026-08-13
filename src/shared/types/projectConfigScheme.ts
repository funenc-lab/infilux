import type { ClaudePolicyConfig } from './claudePolicy';

export interface ProjectConfigSchemeWorktreeInitialization {
  autoInitWorktree: boolean;
  initScript: string;
}

export interface ProjectConfigScheme {
  id: string;
  name: string;
  description: string;
  claudePolicy: ClaudePolicyConfig;
  promptPresetId: string | null;
  worktreeInitialization: ProjectConfigSchemeWorktreeInitialization;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectConfigSchemeSelection {
  schemeId: string;
  updatedAt: number;
}

export interface WorktreeConfigSchemeSelection extends ProjectConfigSchemeSelection {
  repoPath: string;
}

interface ResolveProjectConfigSchemePolicyParams {
  schemes: ProjectConfigScheme[];
  selectedSchemeId?: string | null;
  directPolicy?: ClaudePolicyConfig | null;
}

interface ResolveProjectConfigSchemePromptPresetIdParams {
  schemes: ProjectConfigScheme[];
  repositorySchemeId?: string | null;
  worktreeSchemeId?: string | null;
}

interface ResolveProjectConfigSchemeWorktreeInitializationParams {
  schemes: ProjectConfigScheme[];
  selectedSchemeId?: string | null;
  directInitialization?: ProjectConfigSchemeWorktreeInitialization | null;
}

type PolicyListKey =
  | 'allowedCapabilityIds'
  | 'blockedCapabilityIds'
  | 'allowedSharedMcpIds'
  | 'blockedSharedMcpIds'
  | 'allowedPersonalMcpIds'
  | 'blockedPersonalMcpIds';

interface PolicyBucketKeys {
  allowed: PolicyListKey;
  blocked: PolicyListKey;
}

const POLICY_BUCKETS: PolicyBucketKeys[] = [
  {
    allowed: 'allowedCapabilityIds',
    blocked: 'blockedCapabilityIds',
  },
  {
    allowed: 'allowedSharedMcpIds',
    blocked: 'blockedSharedMcpIds',
  },
  {
    allowed: 'allowedPersonalMcpIds',
    blocked: 'blockedPersonalMcpIds',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  return [
    ...new Set(
      values.filter((value): value is string => typeof value === 'string' && value.length > 0)
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sanitizeWorktreeInitialization(value: unknown): ProjectConfigSchemeWorktreeInitialization {
  const candidate = isRecord(value) ? value : {};
  return {
    autoInitWorktree: candidate.autoInitWorktree === true,
    initScript: typeof candidate.initScript === 'string' ? candidate.initScript : '',
  };
}

function sanitizeClaudePolicyConfig(policy: unknown): ClaudePolicyConfig {
  const candidate = isRecord(policy) ? policy : {};
  return {
    allowedCapabilityIds: normalizeStringList(candidate.allowedCapabilityIds),
    blockedCapabilityIds: normalizeStringList(candidate.blockedCapabilityIds),
    allowedSharedMcpIds: normalizeStringList(candidate.allowedSharedMcpIds),
    blockedSharedMcpIds: normalizeStringList(candidate.blockedSharedMcpIds),
    allowedPersonalMcpIds: normalizeStringList(candidate.allowedPersonalMcpIds),
    blockedPersonalMcpIds: normalizeStringList(candidate.blockedPersonalMcpIds),
    updatedAt: normalizeTimestamp(candidate.updatedAt),
  };
}

function clonePolicy(policy: ClaudePolicyConfig): ClaudePolicyConfig {
  return sanitizeClaudePolicyConfig(policy);
}

function applyPolicyBucketOverride(
  base: ClaudePolicyConfig,
  direct: ClaudePolicyConfig,
  keys: PolicyBucketKeys
): void {
  const allowed = new Set(base[keys.allowed]);
  const blocked = new Set(base[keys.blocked]);

  for (const id of direct[keys.allowed]) {
    blocked.delete(id);
    allowed.add(id);
  }

  for (const id of direct[keys.blocked]) {
    allowed.delete(id);
    blocked.add(id);
  }

  base[keys.allowed] = normalizeStringList([...allowed]);
  base[keys.blocked] = normalizeStringList([...blocked]);
}

function findScheme(
  schemes: ProjectConfigScheme[],
  schemeId: string | null | undefined
): ProjectConfigScheme | null {
  if (!schemeId) {
    return null;
  }

  return schemes.find((scheme) => scheme.id === schemeId) ?? null;
}

export function createEmptyProjectConfigSchemePolicy(updatedAt = 0): ClaudePolicyConfig {
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

export function createDefaultProjectConfigSchemeWorktreeInitialization(): ProjectConfigSchemeWorktreeInitialization {
  return {
    autoInitWorktree: false,
    initScript: '',
  };
}

export function sanitizeProjectConfigScheme(value: unknown): ProjectConfigScheme | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || !name) {
    return null;
  }

  const description = typeof value.description === 'string' ? value.description.trim() : '';
  const promptPresetId =
    typeof value.promptPresetId === 'string' && value.promptPresetId.trim().length > 0
      ? value.promptPresetId.trim()
      : null;

  return {
    id,
    name,
    description,
    claudePolicy: sanitizeClaudePolicyConfig(value.claudePolicy),
    promptPresetId,
    worktreeInitialization: sanitizeWorktreeInitialization(value.worktreeInitialization),
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
}

export function sanitizeProjectConfigSchemes(value: unknown): ProjectConfigScheme[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const schemes: ProjectConfigScheme[] = [];
  const seenIds = new Set<string>();
  for (const item of value) {
    const scheme = sanitizeProjectConfigScheme(item);
    if (!scheme || seenIds.has(scheme.id)) {
      continue;
    }
    seenIds.add(scheme.id);
    schemes.push(scheme);
  }
  return schemes;
}

export function resolveProjectConfigSchemePolicy({
  schemes,
  selectedSchemeId,
  directPolicy,
}: ResolveProjectConfigSchemePolicyParams): ClaudePolicyConfig | null {
  const selectedScheme = findScheme(schemes, selectedSchemeId);
  const basePolicy = selectedScheme ? clonePolicy(selectedScheme.claudePolicy) : null;

  if (!basePolicy) {
    return directPolicy ? clonePolicy(directPolicy) : null;
  }

  if (!directPolicy) {
    return basePolicy;
  }

  const direct = clonePolicy(directPolicy);
  for (const bucket of POLICY_BUCKETS) {
    applyPolicyBucketOverride(basePolicy, direct, bucket);
  }

  basePolicy.updatedAt = Math.max(basePolicy.updatedAt, direct.updatedAt);
  return basePolicy;
}

export function resolveProjectConfigSchemePromptPresetId({
  schemes,
  repositorySchemeId,
  worktreeSchemeId,
}: ResolveProjectConfigSchemePromptPresetIdParams): string | null {
  const worktreeScheme = findScheme(schemes, worktreeSchemeId);
  if (worktreeScheme?.promptPresetId) {
    return worktreeScheme.promptPresetId;
  }

  const repositoryScheme = findScheme(schemes, repositorySchemeId);
  return repositoryScheme?.promptPresetId ?? null;
}

export function resolveProjectConfigSchemeWorktreeInitialization({
  schemes,
  selectedSchemeId,
  directInitialization,
}: ResolveProjectConfigSchemeWorktreeInitializationParams): ProjectConfigSchemeWorktreeInitialization {
  if (directInitialization) {
    return sanitizeWorktreeInitialization(directInitialization);
  }

  const selectedScheme = findScheme(schemes, selectedSchemeId);
  return selectedScheme
    ? sanitizeWorktreeInitialization(selectedScheme.worktreeInitialization)
    : createDefaultProjectConfigSchemeWorktreeInitialization();
}
