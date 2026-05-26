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

export function getMeaningfulTerminalTitle(title?: string | null): string | undefined {
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) {
    return undefined;
  }

  const normalizedTitle = normalizeSessionTitleText(trimmedTitle);
  if (isUnusableNormalizedSessionTitle(normalizedTitle)) {
    return undefined;
  }

  return normalizedTitle;
}

export function getDefaultSessionName(agentId?: string): string {
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

export function getStoredSessionName(name: string, agentId?: string): string {
  const normalizedName = normalizeSessionTitleText(name);
  if (isUnusableNormalizedSessionTitle(normalizedName)) {
    return getDefaultSessionName(agentId);
  }
  return normalizedName;
}
