import path from 'node:path';
import type { SessionCreateOptions } from '@shared/types';

type CodexShellFragmentStyle = 'posix' | 'powershell';

const CODEX_EXECUTABLE_NAMES = new Set(['codex', 'codex.exe', 'codex.cmd', 'codex.bat']);
const CODEX_TOKEN_PATTERN =
  /(^|[\s&])((?:"[^"]*codex(?:\.(?:exe|cmd|bat))?"|'[^']*codex(?:\.(?:exe|cmd|bat))?'|[^\s'"\x60]+[\\/]codex(?:\.(?:exe|cmd|bat))?|codex(?:\.(?:exe|cmd|bat))?))(?=(?:[\s'"]|$))/i;
const SQLITE_CONFIG_PATTERN = /^sqlite_home\s*=/;
const UNSUPPORTED_LAUNCH_MESSAGE =
  'Codex SQLite override could not match the current session launch shape';

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

export function applyCodexSqliteLaunchOptions(
  options: SessionCreateOptions,
  sqliteHomePath: string
): SessionCreateOptions {
  if (options.hostSession?.mode === 'attach-existing') {
    return options;
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
  const nestedFragment =
    options.hostSession?.kind === 'tmux' ? commandFragment.replace(/'/g, "'\\''") : commandFragment;
  const initialCommand = options.initialCommand
    ? addToCommand(options.initialCommand, nestedFragment)
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
