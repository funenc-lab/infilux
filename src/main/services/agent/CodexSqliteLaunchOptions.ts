import path from 'node:path';
import type { SessionCreateOptions } from '@shared/types';

type CodexShellFragmentStyle = 'posix' | 'powershell';

const CODEX_EXECUTABLE_NAMES = new Set(['codex', 'codex.exe', 'codex.cmd', 'codex.bat']);
const CODEX_TOKEN_PATTERN =
  /(^|[\s&])((?:"[^"]*codex(?:\.(?:exe|cmd|bat))?"|'[^']*codex(?:\.(?:exe|cmd|bat))?'|[^\s'"\x60]+[\\/]codex(?:\.(?:exe|cmd|bat))?|codex(?:\.(?:exe|cmd|bat))?))(?=(?:[\s'"]|$))/i;
const SQLITE_CONFIG_PATTERN = /^sqlite_home\s*=/;
const UNSUPPORTED_LAUNCH_MESSAGE =
  'Codex SQLite override could not match the current session launch shape';
export const CODEX_WRAPPER_SQLITE_WARNING =
  'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches. Use the native Codex environment for worktree-scoped resume history.';

export function isCodexThirdPartyWrapperLaunch(options: SessionCreateOptions): boolean {
  if (isCodexShell(options.shell)) {
    return false;
  }
  const environment = options.metadata?.environment;
  if (environment === 'hapi' || environment === 'happy') {
    return true;
  }
  const command = options.initialCommand ?? options.args?.at(-1) ?? '';
  return /(?:^|[;&|]\s*|\b(?:then|else|exec)\s+)(?:(?:npx\s+-y\s+@twsxtd\/hapi|hapi|happy)\s+)(?:[^\s;&|]+\s+)*?[^\s;&|]*codex(?:\.(?:exe|cmd|bat))?(?=\s|[;&|]|$)/i.test(
    command
  );
}

export function quoteCodexShellAssignment(
  assignment: string,
  style: CodexShellFragmentStyle
): string {
  if (style === 'powershell') {
    return `'${assignment.replace(/'/g, "''")}'`;
  }
  return `"${assignment.replace(/["\\$\x60]/g, '\\$&')}"`;
}

export function isCodexShell(shell: string | undefined): boolean {
  if (!shell) {
    return false;
  }
  const normalizedShell = shell.replace(/\\/g, '/').replace(/^['"]|['"]$/g, '');
  return CODEX_EXECUTABLE_NAMES.has(path.posix.basename(normalizedShell).toLowerCase());
}

export function resolveShellFragmentStyle(shell: string | undefined): CodexShellFragmentStyle {
  const normalizedShell = shell?.replace(/\\/g, '/').replace(/^['"]|['"]$/g, '') ?? '';
  const fileName = path.posix.basename(normalizedShell).toLowerCase();
  return ['powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'].includes(fileName)
    ? 'powershell'
    : 'posix';
}

export function isUnsupportedShellConfig(sessionOptions: SessionCreateOptions): boolean {
  const shellType = sessionOptions.shellConfig?.shellType;
  return (
    shellType === 'powershell' ||
    shellType === 'powershell7' ||
    shellType === 'cmd' ||
    shellType === 'wsl'
  );
}

export function injectCodexShellFragment(command: string, shellFragment: string): string | null {
  if (!command.trim()) {
    return null;
  }
  let applied = false;
  const updated = command.replace(CODEX_TOKEN_PATTERN, (_fullMatch, prefix, executable) => {
    applied = true;
    return `${prefix + executable} ${shellFragment}`;
  });
  return applied ? updated : null;
}

export function patchTrailingCommandArg(
  args: string[] | undefined,
  shellFragment: string
): string[] | undefined {
  if (!args?.length) {
    return undefined;
  }
  const lastIndex = args.length - 1;
  const updatedCommand = injectCodexShellFragment(args[lastIndex] ?? '', shellFragment);
  if (!updatedCommand) {
    return undefined;
  }
  const nextArgs = [...args];
  nextArgs[lastIndex] = updatedCommand;
  return nextArgs;
}

function removeSqliteConfigArgs(args: readonly string[]): string[] {
  const filtered: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if ((arg === '-c' || arg === '--config') && SQLITE_CONFIG_PATTERN.test(args[index + 1] ?? '')) {
      index += 1;
      continue;
    }
    if (arg.startsWith('--config=') && SQLITE_CONFIG_PATTERN.test(arg.slice('--config='.length))) {
      continue;
    }
    filtered.push(arg);
  }
  return filtered;
}

function resolveConfigInsertionIndex(args: readonly string[]): number {
  let index = 0;
  while (index < args.length) {
    if (args[index] === '-c' || args[index] === '--config') {
      index += 2;
      continue;
    }
    if (args[index]?.startsWith('--config=')) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function isSupportedCommandShell(options: SessionCreateOptions): boolean {
  const shell = options.shell?.replace(/\\/g, '/').replace(/^['"]|['"]$/g, '');
  const fileName = shell ? path.posix.basename(shell).toLowerCase() : '';
  return (
    [
      'bash',
      'zsh',
      'sh',
      'fish',
      'nu',
      'pwsh',
      'pwsh.exe',
      'powershell',
      'powershell.exe',
    ].includes(fileName) ||
    (!shell &&
      (!options.shellConfig ||
        ['bash', 'zsh', 'fish', 'powershell', 'powershell7'].includes(
          options.shellConfig.shellType
        )))
  );
}

function addToCommand(command: string, fragment: string): string | null {
  const codexExecutables = command.match(new RegExp(CODEX_TOKEN_PATTERN.source, 'gi')) ?? [];
  if (codexExecutables.length > 1) {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: multiple Codex commands`);
  }
  if (/\b(?:echo|printf|command\s+-v|which)\s+codex\b/i.test(command)) {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: unsupported custom launcher`);
  }
  if (command.includes(fragment)) {
    return command;
  }
  if (/\bsqlite_home\s*=/.test(command)) {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: conflicting custom sqlite_home argument`);
  }
  return injectCodexShellFragment(command, fragment);
}

function patchShellArgs(args: string[] | undefined, fragment: string): string[] | undefined {
  if (!args?.length) {
    return undefined;
  }
  const updated = addToCommand(args[args.length - 1] ?? '', fragment);
  return updated ? [...args.slice(0, -1), updated] : undefined;
}

function patchTmuxSessionCommand(
  command: string,
  sessionName: string,
  fragment: string
): string | null {
  const newSessionIndex = command.indexOf('new-session ');
  if (newSessionIndex < 0) {
    return null;
  }
  const sessionMarker = `-s ${sessionName} `;
  const markerIndex = command.indexOf(sessionMarker, newSessionIndex);
  if (markerIndex < 0) {
    return null;
  }
  const payloadStart = markerIndex + sessionMarker.length;
  if (command[payloadStart] !== "'") {
    return null;
  }
  let payload = '';
  let payloadEnd = payloadStart + 1;
  while (payloadEnd < command.length) {
    if (command.startsWith("'\\''", payloadEnd)) {
      payload += "'";
      payloadEnd += 4;
      continue;
    }
    if (command[payloadEnd] === "'") {
      const updated = addToCommand(payload, fragment);
      return updated
        ? `${command.slice(0, payloadStart)}'${updated.replace(/'/g, "'\\''")}'${command.slice(payloadEnd + 1)}`
        : null;
    }
    payload += command[payloadEnd];
    payloadEnd += 1;
  }
  return null;
}

export function applyCodexSqliteLaunchOptions(
  options: SessionCreateOptions,
  sqliteHomePath: string
): SessionCreateOptions {
  if (options.hostSession?.mode === 'attach-existing') {
    return options;
  }
  if (isCodexThirdPartyWrapperLaunch(options)) {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: unsupported wrapper command`);
  }
  const assignment = `sqlite_home=${JSON.stringify(sqliteHomePath)}`;
  const fallbackFragment = `-c ${quoteCodexShellAssignment(assignment, resolveShellFragmentStyle(options.fallbackShell))}`;
  const fallbackArgs = options.fallbackArgs
    ? patchShellArgs(options.fallbackArgs, fallbackFragment)
    : undefined;
  if (options.fallbackArgs && !fallbackArgs) {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: unsupported fallback command`);
  }

  if (isCodexShell(options.shell)) {
    const args = removeSqliteConfigArgs(options.args ?? []);
    const prefix = ['-c', assignment];
    const position = resolveConfigInsertionIndex(args);
    const nextArgs = [...args.slice(0, position), ...prefix, ...args.slice(position)];
    return {
      ...options,
      args: nextArgs,
      ...(fallbackArgs ? { fallbackArgs } : {}),
    };
  }

  if (options.shellConfig?.shellType === 'cmd' || options.shellConfig?.shellType === 'wsl') {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: unsupported shell type`);
  }
  if (!isSupportedCommandShell(options)) {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: unsupported custom launcher`);
  }
  const style = options.shellConfig?.shellType?.startsWith('powershell')
    ? 'powershell'
    : resolveShellFragmentStyle(options.shell);
  const commandFragment = `-c ${quoteCodexShellAssignment(assignment, style)}`;
  const initialCommand = options.initialCommand
    ? options.hostSession?.kind === 'tmux'
      ? patchTmuxSessionCommand(
          options.initialCommand,
          options.hostSession.sessionName,
          commandFragment
        )
      : addToCommand(options.initialCommand, commandFragment)
    : null;
  if (initialCommand) {
    return {
      ...options,
      initialCommand,
      ...(fallbackArgs ? { fallbackArgs } : {}),
    };
  }

  const args = patchShellArgs(options.args, commandFragment);
  if (args) {
    return { ...options, args, ...(fallbackArgs ? { fallbackArgs } : {}) };
  }
  throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: use a standard Codex executable command`);
}
