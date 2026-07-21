const SESSION_TITLE_PROMPT_PREFIX = /^(?:[›❯»→➜>]+)\s*/u;
const GENERIC_SHELL_TITLE = /[/\\](pwsh|powershell|cmd|bash|zsh|sh|fish|nu|wsl)(\.exe)?["']?\s*$/i;
const PRIVILEGED_SESSION_TITLE = /^(Administrator|root)\s*:/i;
const GENERIC_COMMAND_TITLE = /^(npm|npx|node|python|py|pnpm|yarn|bun|deno|cargo|go|java|ruby)\s/i;
const MACOS_MALLOC_DIAGNOSTIC_TITLE = /^\S+\(\d+\)\s+Malloc\w*/;
const UNUSABLE_SESSION_TITLE_PATTERNS = [
  GENERIC_SHELL_TITLE,
  PRIVILEGED_SESSION_TITLE,
  GENERIC_COMMAND_TITLE,
  MACOS_MALLOC_DIAGNOSTIC_TITLE,
] as const;

const BUILTIN_AGENT_NAMES: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  droid: 'Droid',
  gemini: 'Gemini',
  auggie: 'Auggie',
  cursor: 'Cursor',
  opencode: 'OpenCode',
};

export function normalizeSessionTitleText(text: string): string {
  const normalizedWhitespace = text.replace(/\s+/g, ' ').trim();
  if (!normalizedWhitespace) return '';

  return normalizedWhitespace.replace(SESSION_TITLE_PROMPT_PREFIX, '').trim();
}

function isUnusableNormalizedSessionTitle(title: string): boolean {
  return !title || UNUSABLE_SESSION_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

export function isUnusableSessionTitle(title?: string | null): boolean {
  return isUnusableNormalizedSessionTitle(normalizeSessionTitleText(title ?? ''));
}

export function areSessionTitlesEqual(left: string, right: string): boolean {
  return (
    normalizeSessionTitleText(left).toLowerCase() === normalizeSessionTitleText(right).toLowerCase()
  );
}

export function getDefaultSessionName(agentId?: string, explicitDefaultName?: string): string {
  const normalizedExplicitDefault = normalizeSessionTitleText(explicitDefaultName ?? '');
  if (normalizedExplicitDefault) {
    return normalizedExplicitDefault;
  }

  if (!agentId) {
    return 'Agent';
  }

  const isHapi = agentId.endsWith('-hapi');
  const isHappy = agentId.endsWith('-happy');
  const baseId = isHapi
    ? agentId.slice(0, -'-hapi'.length)
    : isHappy
      ? agentId.slice(0, -'-happy'.length)
      : agentId;
  const baseName = BUILTIN_AGENT_NAMES[baseId] ?? baseId;

  if (isHapi) {
    return `${baseName} (Hapi)`;
  }
  if (isHappy) {
    return `${baseName} (Happy)`;
  }
  return baseName;
}

export function getStoredSessionName(
  name: string,
  agentId?: string,
  explicitDefaultName?: string
): string {
  const normalizedName = normalizeSessionTitleText(name);
  if (isUnusableNormalizedSessionTitle(normalizedName)) {
    return getDefaultSessionName(agentId, explicitDefaultName);
  }
  return normalizedName;
}

export function getExplicitSessionName(
  name: string,
  agentId?: string,
  explicitDefaultName?: string
): string {
  return normalizeSessionTitleText(name) || getDefaultSessionName(agentId, explicitDefaultName);
}

export function getCanonicalSessionName(input: {
  agentId?: string;
  defaultName?: string;
  name: string;
  userRenamed?: boolean;
}): string {
  if (input.userRenamed) {
    return getExplicitSessionName(input.name, input.agentId, input.defaultName);
  }

  const defaultName = getDefaultSessionName(input.agentId, input.defaultName);
  return getStoredSessionName(input.name, input.agentId, defaultName);
}
