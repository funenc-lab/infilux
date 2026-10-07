import type {
  CodexLaunchDescriptor,
  SessionCreateOptions,
  SessionHostSessionOptions,
} from '../types/session';
import { AGENT_TMUX_UNSET_ENV_KEYS, buildEnvUnsetPrefix } from './agentEnvironment';
import { buildShellCommandFromExecutablePath } from './shellCommand';
import { buildManagedTmuxSocketShellDir, buildManagedTmuxSocketShellPath } from './tmux';

type NativeDescriptor = Extract<CodexLaunchDescriptor, { kind: 'native' }>;

export function quotePosixShell(input: string): string {
  return `'${input.replace(/'/g, "'\\''")}'`;
}

export function quoteCodexConfigAssignment(
  assignment: string,
  style: 'posix' | 'powershell'
): string {
  return style === 'powershell'
    ? `'${assignment.replace(/'/g, "''")}'`
    : `"${assignment.replace(/["\\$\x60]/g, '\\$&')}"`;
}

export function buildSanitizedAgentCommand(baseCommand: string): string {
  return `env ${buildEnvUnsetPrefix(AGENT_TMUX_UNSET_ENV_KEYS)} ${baseCommand}`.trim();
}

function buildTmuxSessionEnvironmentArgs(variableNames: readonly string[]): string {
  return variableNames.map((variableName) => `-e ${variableName}="\${${variableName}}"`).join(' ');
}

export function buildTmuxAttachCommand(
  baseCommand: string,
  tmuxServerName: string,
  tmuxSessionName: string,
  options: { createIfMissing: boolean; sessionEnvironmentVariableNames: readonly string[] }
): string {
  const tmuxSocketDir = buildManagedTmuxSocketShellDir();
  const tmuxSocketPath = buildManagedTmuxSocketShellPath(tmuxServerName);
  const quotedBaseCommand = quotePosixShell(buildSanitizedAgentCommand(baseCommand));
  const ensureSocketDirCommand = `mkdir -p "${tmuxSocketDir}"`;
  const sessionEnvironmentArgs = buildTmuxSessionEnvironmentArgs(
    options.sessionEnvironmentVariableNames
  );
  const createSessionArgs = ['-d', sessionEnvironmentArgs, '-s', tmuxSessionName]
    .filter(Boolean)
    .join(' ');
  const createSessionCommand =
    `env -u TMUX tmux -S "${tmuxSocketPath}" -f /dev/null new-session ${createSessionArgs} ` +
    `${quotedBaseCommand} >/dev/null 2>&1 || true`;
  const hideStatusCommand =
    `env -u TMUX tmux -S "${tmuxSocketPath}" set-option -t ${tmuxSessionName} status off ` +
    '>/dev/null 2>&1 || true';
  const disableMouseCommand =
    `env -u TMUX tmux -S "${tmuxSocketPath}" set-option -t ${tmuxSessionName} mouse off ` +
    '>/dev/null 2>&1 || true';
  const attachSessionCommand = `exec env -u TMUX tmux -S "${tmuxSocketPath}" attach-session -t ${tmuxSessionName}`;

  if (!options.createIfMissing) {
    return `${ensureSocketDirCommand}; ${hideStatusCommand}; ${disableMouseCommand}; ${attachSessionCommand}`;
  }

  return `${ensureSocketDirCommand}; ${createSessionCommand}; ${hideStatusCommand}; ${disableMouseCommand}; ${attachSessionCommand}`;
}

function buildNativeBaseCommand(descriptor: NativeDescriptor): string {
  const style =
    descriptor.layout === 'powershell' ||
    (descriptor.layout === 'remote' &&
      (descriptor.executionPlatform === 'win32' ||
        descriptor.shellPath.toLowerCase().includes('powershell') ||
        descriptor.shellPath.toLowerCase().includes('pwsh')))
      ? 'powershell'
      : 'posix';
  const configArgs = (descriptor.appliedAssignments ?? []).flatMap((assignment) => [
    '-c',
    quoteCodexConfigAssignment(assignment, style),
  ]);
  return buildShellCommandFromExecutablePath({
    shellPath: descriptor.shellPath,
    executionPlatform: descriptor.executionPlatform,
    executablePath: descriptor.executable,
    rawArgs: [...configArgs, ...descriptor.rawArgs],
  });
}

export function renderCodexNativeLaunch(
  descriptor: NativeDescriptor,
  hostSession?: SessionHostSessionOptions
): Pick<
  SessionCreateOptions,
  'shell' | 'args' | 'fallbackShell' | 'fallbackArgs' | 'initialCommand'
> {
  const baseCommand = buildNativeBaseCommand(descriptor);
  switch (descriptor.layout) {
    case 'direct':
      return {
        shell: descriptor.executable,
        args: [
          ...(descriptor.appliedAssignments ?? []).flatMap((assignment) => ['-c', assignment]),
          ...descriptor.rawArgs,
        ],
        fallbackShell: descriptor.shellPath,
        fallbackArgs: [...(descriptor.fallbackArgsPrefix ?? []), baseCommand],
      };
    case 'initial':
      return { initialCommand: buildSanitizedAgentCommand(baseCommand) };
    case 'remote':
      return { initialCommand: baseCommand };
    case 'powershell':
      return {
        shell: descriptor.shellPath,
        args: [...(descriptor.shellArgsPrefix ?? []), `& { ${baseCommand} }`],
      };
    case 'tmux':
    case 'tmux-attach': {
      if (hostSession?.kind !== 'tmux') {
        throw new Error('Codex native tmux launch requires a managed host session');
      }
      return {
        initialCommand: buildSanitizedAgentCommand(
          buildTmuxAttachCommand(baseCommand, hostSession.serverName, hostSession.sessionName, {
            createIfMissing: descriptor.layout === 'tmux',
            sessionEnvironmentVariableNames: [
              'CODEX_HOME',
              'CODEX_SQLITE_HOME',
              'INFILUX_MANAGED_CODEX_RUNTIME_HOME',
            ],
          })
        ),
      };
    }
  }
}
