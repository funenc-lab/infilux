import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface ClaudeProjectSettings {
  allowedTools?: string[];
  mcpContextUris?: string[];
  mcpServers?: Record<string, unknown>;
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
  hasTrustDialogAccepted?: boolean;
  projectOnboardingSeenCount?: number;
  hasClaudeMdExternalIncludesApproved?: boolean;
  hasClaudeMdExternalIncludesWarningShown?: boolean;
  [key: string]: unknown;
}

export interface ClaudeJson {
  projects?: Record<string, ClaudeProjectSettings>;
  [key: string]: unknown;
}

export interface ClaudeWorkspaceSettingsOptions {
  claudeJsonPath?: string;
  resolveRealpath?: (workspacePath: string) => string;
}

function getClaudeJsonPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

function readClaudeJson(claudeJsonPath: string): ClaudeJson {
  try {
    if (!fs.existsSync(claudeJsonPath)) {
      return {};
    }

    const content = fs.readFileSync(claudeJsonPath, 'utf8');
    if (!content.trim()) {
      return {};
    }
    return JSON.parse(content) as ClaudeJson;
  } catch (error) {
    console.error('[ClaudeWorkspaceTrust] Failed to read .claude.json:', error);
    return {};
  }
}

function writeClaudeJson(claudeJsonPath: string, data: ClaudeJson): boolean {
  try {
    fs.mkdirSync(path.dirname(claudeJsonPath), { recursive: true });
    fs.writeFileSync(claudeJsonPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    return true;
  } catch (error) {
    console.error('[ClaudeWorkspaceTrust] Failed to write .claude.json:', error);
    return false;
  }
}

function buildTrustedProjectSettings(
  existing: ClaudeProjectSettings | undefined
): ClaudeProjectSettings {
  return {
    allowedTools: Array.isArray(existing?.allowedTools) ? existing.allowedTools : [],
    mcpContextUris: Array.isArray(existing?.mcpContextUris) ? existing.mcpContextUris : [],
    mcpServers:
      existing?.mcpServers && typeof existing.mcpServers === 'object' ? existing.mcpServers : {},
    enabledMcpjsonServers: Array.isArray(existing?.enabledMcpjsonServers)
      ? existing.enabledMcpjsonServers
      : [],
    disabledMcpjsonServers: Array.isArray(existing?.disabledMcpjsonServers)
      ? existing.disabledMcpjsonServers
      : [],
    projectOnboardingSeenCount:
      typeof existing?.projectOnboardingSeenCount === 'number'
        ? existing.projectOnboardingSeenCount
        : 0,
    hasClaudeMdExternalIncludesApproved:
      typeof existing?.hasClaudeMdExternalIncludesApproved === 'boolean'
        ? existing.hasClaudeMdExternalIncludesApproved
        : false,
    hasClaudeMdExternalIncludesWarningShown:
      typeof existing?.hasClaudeMdExternalIncludesWarningShown === 'boolean'
        ? existing.hasClaudeMdExternalIncludesWarningShown
        : false,
    ...existing,
    hasTrustDialogAccepted: true,
  };
}

function normalizeWorkspacePath(workspacePath: string): string {
  return path.normalize(workspacePath.trim());
}

function collectWorkspaceTrustTargets(
  workspacePath: string,
  resolveRealpath: (workspacePath: string) => string
): string[] {
  const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
  const targets = new Set<string>();

  if (normalizedWorkspacePath.length > 0) {
    targets.add(normalizedWorkspacePath);
  }

  try {
    const realpathWorkspace = normalizeWorkspacePath(resolveRealpath(workspacePath));
    if (realpathWorkspace.length > 0) {
      targets.add(realpathWorkspace);
    }
  } catch {
    // Ignore canonicalization failures and keep the original path.
  }

  return [...targets];
}

function getWorkspaceSettingsOptions(
  options: ClaudeWorkspaceSettingsOptions = {}
): Required<ClaudeWorkspaceSettingsOptions> {
  return {
    claudeJsonPath: options.claudeJsonPath ?? getClaudeJsonPath(),
    resolveRealpath:
      options.resolveRealpath ?? ((targetPath: string) => fs.realpathSync.native(targetPath)),
  };
}

function getProjectSettingsTargets(
  workspacePath: string,
  options: ClaudeWorkspaceSettingsOptions = {}
): { claudeJsonPath: string; targets: string[] } {
  const normalizedOptions = getWorkspaceSettingsOptions(options);
  return {
    claudeJsonPath: normalizedOptions.claudeJsonPath,
    targets: collectWorkspaceTrustTargets(workspacePath, normalizedOptions.resolveRealpath),
  };
}

export function readClaudeProjectSettings(
  workspacePath: string,
  options: ClaudeWorkspaceSettingsOptions = {}
): ClaudeProjectSettings | null {
  if (!workspacePath || workspacePath.trim().length === 0) {
    return null;
  }

  const { claudeJsonPath, targets } = getProjectSettingsTargets(workspacePath, options);
  const data = readClaudeJson(claudeJsonPath);
  const projects = data.projects ?? {};

  for (const targetPath of targets) {
    if (projects[targetPath]) {
      return projects[targetPath] ?? null;
    }
  }

  return null;
}

export function writeClaudeProjectSettings(
  workspacePath: string,
  settings: ClaudeProjectSettings,
  options: ClaudeWorkspaceSettingsOptions = {}
): boolean {
  if (!workspacePath || workspacePath.trim().length === 0) {
    return false;
  }

  const { claudeJsonPath, targets } = getProjectSettingsTargets(workspacePath, options);
  if (targets.length === 0) {
    return false;
  }

  const data = readClaudeJson(claudeJsonPath);
  const projects = { ...(data.projects ?? {}) };

  for (const targetPath of targets) {
    projects[targetPath] = { ...settings };
  }

  data.projects = projects;
  return writeClaudeJson(claudeJsonPath, data);
}

export function updateClaudeProjectSettings(
  workspacePath: string,
  update: (existing: ClaudeProjectSettings | undefined) => ClaudeProjectSettings,
  options: ClaudeWorkspaceSettingsOptions = {}
): boolean {
  if (!workspacePath || workspacePath.trim().length === 0) {
    return false;
  }

  const { claudeJsonPath, targets } = getProjectSettingsTargets(workspacePath, options);
  if (targets.length === 0) {
    return false;
  }

  const data = readClaudeJson(claudeJsonPath);
  const projects = { ...(data.projects ?? {}) };
  const nextPrimarySettings = update(projects[targets[0]]);

  for (const targetPath of targets) {
    const existing = projects[targetPath];
    projects[targetPath] = existing ? update(existing) : { ...nextPrimarySettings };
  }

  data.projects = projects;
  return writeClaudeJson(claudeJsonPath, data);
}

export function ensureClaudeWorkspaceTrusted(
  workspacePath: string,
  options: ClaudeWorkspaceSettingsOptions = {}
): boolean {
  if (!workspacePath || workspacePath.trim().length === 0) {
    return false;
  }

  return updateClaudeProjectSettings(
    workspacePath,
    (existing) => buildTrustedProjectSettings(existing),
    options
  );
}
