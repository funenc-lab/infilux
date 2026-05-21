export const AGENT_PRESENTATION_ENV_KEYS = [
  'NO_COLOR',
  'COLOR',
  'CLICOLOR',
  'CLICOLOR_FORCE',
] as const;

export const AGENT_INHERITED_ENV_NOISE_KEYS = [
  'CODEX_CI',
  'CODEX_THREAD_ID',
  'MallocStackLogging',
  'MallocStackLoggingNoCompact',
  'MallocNanoZone',
  'MallocScribble',
  'MallocGuardEdges',
  'MallocCheckHeapStart',
  'MallocCheckHeapEach',
  'MallocErrorAbort',
] as const;

export const AGENT_TMUX_UNSET_ENV_KEYS = [
  ...AGENT_PRESENTATION_ENV_KEYS,
  ...AGENT_INHERITED_ENV_NOISE_KEYS,
] as const;

export function buildEnvUnsetPrefix(keys: readonly string[]): string {
  return keys.map((key) => `-u ${key}`).join(' ');
}
