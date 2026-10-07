import path from 'node:path';
import type { CodexLaunchDescriptor, SessionCreateOptions } from '@shared/types';
import { renderCodexNativeLaunch } from '@shared/utils/codexNativeLaunch';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';

type NativeCodexDescriptor = Extract<CodexLaunchDescriptor, { kind: 'native' }>;

const CODEX_EXECUTABLE_NAMES = new Set(['codex', 'codex.exe', 'codex.cmd', 'codex.bat']);
const NATIVE_CODEX_LAUNCH_LAYOUTS = new Set([
  'direct',
  'initial',
  'tmux',
  'tmux-attach',
  'powershell',
  'remote',
]);
const SQLITE_CONFIG_PATTERN = /^sqlite_home\s*=/;
const UNSUPPORTED_LAUNCH_MESSAGE =
  'Codex SQLite override could not match the current session launch shape';

export const CODEX_WRAPPER_SQLITE_WARNING =
  'Codex SQLite index isolation is unavailable for Hapi/Happy wrapper launches. Use the native Codex environment for worktree-scoped resume history.';

export function isCodexShell(shell: string | undefined): boolean {
  const normalizedShell = shell?.replace(/\\/g, '/');
  return Boolean(
    normalizedShell &&
      CODEX_EXECUTABLE_NAMES.has(path.posix.basename(normalizedShell).toLowerCase())
  );
}

export function isCodexThirdPartyWrapperLaunch(options: SessionCreateOptions): boolean {
  const descriptor = options.codexLaunch;
  if (isCodexShell(options.shell) || descriptor?.kind !== 'wrapper') {
    return false;
  }
  return (
    options.shell === descriptor.originalShell &&
    options.initialCommand === descriptor.originalInitialCommand &&
    JSON.stringify(options.args) === JSON.stringify(descriptor.originalArgs) &&
    JSON.stringify(options.hostSession) === JSON.stringify(descriptor.originalHostSession)
  );
}

function isUnsupportedShellConfig(options: SessionCreateOptions): boolean {
  const shellType = options.shellConfig?.shellType;
  return (
    shellType === 'powershell' ||
    shellType === 'powershell7' ||
    shellType === 'cmd' ||
    shellType === 'wsl'
  );
}

function matchesRendererInitialPromptArg(promptArg: string, executionPlatform?: string): boolean {
  const isWindows = executionPlatform === 'win32';
  const opening = isWindows ? '"' : "$'";
  const closing = isWindows ? '"' : "'";
  if (!promptArg.startsWith(opening) || !promptArg.endsWith(closing)) {
    return false;
  }

  const end = promptArg.length - closing.length;
  for (let index = opening.length; index < end; index += 1) {
    const character = promptArg[index];
    if (character === '\0' || character === '\n' || character === '\r') {
      return false;
    }
    if (!isWindows) {
      if (character === "'") {
        return false;
      }
      if (character === '\\') {
        index += 1;
        if (index >= end || !['\\', "'", 'n'].includes(promptArg[index] ?? '')) {
          return false;
        }
      }
      continue;
    }

    // PowerShell does not escape double quotes with the renderer's backslash sequence.
    if (character === '"' || character === '$') {
      return false;
    }
    if (character === '`' || character === '\\' || character === '%') {
      index += 1;
      const escaped = promptArg[index];
      if (
        index >= end ||
        (character === '`' ? escaped !== '`' && escaped !== '$' : escaped !== character)
      ) {
        return false;
      }
    }
  }
  return true;
}

function matchesNativeCodexLaunch(
  options: SessionCreateOptions,
  descriptor: NativeCodexDescriptor
): boolean {
  const isStringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string');
  if (
    typeof descriptor.executable !== 'string' ||
    typeof descriptor.shellPath !== 'string' ||
    !NATIVE_CODEX_LAUNCH_LAYOUTS.has(descriptor.layout) ||
    !isStringList(descriptor.rawArgs) ||
    (descriptor.initialPromptArg !== undefined &&
      (typeof descriptor.initialPromptArg !== 'string' ||
        descriptor.initialPromptArg !== descriptor.rawArgs.at(-1) ||
        descriptor.layout === 'direct' ||
        !matchesRendererInitialPromptArg(
          descriptor.initialPromptArg,
          descriptor.executionPlatform
        ))) ||
    (descriptor.shellArgsPrefix !== undefined && !isStringList(descriptor.shellArgsPrefix)) ||
    (descriptor.fallbackArgsPrefix !== undefined && !isStringList(descriptor.fallbackArgsPrefix)) ||
    (descriptor.appliedAssignments !== undefined && !isStringList(descriptor.appliedAssignments)) ||
    (descriptor.executionPlatform !== undefined &&
      typeof descriptor.executionPlatform !== 'string') ||
    !isCodexShell(descriptor.executable) ||
    (descriptor.layout !== 'remote' && isUnsupportedShellConfig(options))
  ) {
    return false;
  }
  const host = options.hostSession;
  if (
    (descriptor.layout === 'tmux' && host?.mode !== 'create-if-missing') ||
    (descriptor.layout === 'tmux-attach' && host?.mode !== 'attach-existing') ||
    (!['tmux', 'tmux-attach'].includes(descriptor.layout) && host)
  ) {
    return false;
  }
  if (
    (descriptor.layout !== 'remote' &&
      descriptor.rawArgs.some(
        (arg, index) =>
          (index !== descriptor.rawArgs.length - 1 || descriptor.initialPromptArg === undefined) &&
          /sqlite_home\s*=/.test(arg)
      )) ||
    (descriptor.layout === 'remote' && !isRemoteVirtualPath(options.cwd ?? '')) ||
    (descriptor.layout === 'direct' && options.shell !== descriptor.executable) ||
    (descriptor.layout === 'powershell' && options.shell !== descriptor.shellPath) ||
    (descriptor.layout !== 'direct' &&
      descriptor.layout !== 'powershell' &&
      options.shell !== undefined &&
      options.shell !== descriptor.shellPath)
  ) {
    return false;
  }
  try {
    const expected = renderCodexNativeLaunch(descriptor, host);
    return (
      options.initialCommand === expected.initialCommand &&
      options.fallbackShell === expected.fallbackShell &&
      JSON.stringify(options.args) === JSON.stringify(expected.args) &&
      JSON.stringify(options.fallbackArgs) === JSON.stringify(expected.fallbackArgs)
    );
  } catch {
    return false;
  }
}

export function applyCodexNativeLaunchAssignments(
  options: SessionCreateOptions,
  assignments: readonly string[]
): SessionCreateOptions {
  const descriptor = options.codexLaunch;
  if (descriptor?.kind !== 'native' || !matchesNativeCodexLaunch(options, descriptor)) {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: unsupported custom launcher`);
  }
  if (descriptor.layout === 'tmux-attach') {
    return options;
  }
  const nextAssignments = [...(descriptor.appliedAssignments ?? [])];
  for (const assignment of assignments) {
    if (SQLITE_CONFIG_PATTERN.test(assignment)) {
      for (let index = nextAssignments.length - 1; index >= 0; index -= 1) {
        if (SQLITE_CONFIG_PATTERN.test(nextAssignments[index] ?? '')) {
          nextAssignments.splice(index, 1);
        }
      }
    }
    nextAssignments.push(assignment);
  }
  if (JSON.stringify(nextAssignments) === JSON.stringify(descriptor.appliedAssignments ?? [])) {
    return options;
  }
  const nextDescriptor: NativeCodexDescriptor = {
    ...descriptor,
    appliedAssignments: nextAssignments,
  };
  return {
    ...options,
    ...renderCodexNativeLaunch(nextDescriptor, options.hostSession),
    codexLaunch: nextDescriptor,
  };
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
    } else if (args[index]?.startsWith('--config=')) {
      index += 1;
    } else {
      break;
    }
  }
  return index;
}

export function applyCodexSqliteLaunchOptions(
  options: SessionCreateOptions,
  sqliteHomePath: string
): SessionCreateOptions {
  if (options.codexLaunch?.kind === 'native' && options.codexLaunch.layout === 'remote') {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: unsupported custom launcher`);
  }
  if (options.codexLaunch?.kind === 'native') {
    return applyCodexNativeLaunchAssignments(options, [
      `sqlite_home=${JSON.stringify(sqliteHomePath)}`,
    ]);
  }
  if (options.hostSession?.mode === 'attach-existing' && !options.codexLaunch) {
    return options;
  }
  if (
    options.codexLaunch ||
    !isCodexShell(options.shell) ||
    options.initialCommand ||
    options.fallbackShell ||
    options.fallbackArgs
  ) {
    throw new Error(`${UNSUPPORTED_LAUNCH_MESSAGE}: unsupported custom launcher`);
  }

  const args = removeSqliteConfigArgs(options.args ?? []);
  const position = resolveConfigInsertionIndex(args);
  return {
    ...options,
    args: [
      ...args.slice(0, position),
      '-c',
      `sqlite_home=${JSON.stringify(sqliteHomePath)}`,
      ...args.slice(position),
    ],
  };
}
