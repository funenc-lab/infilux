import type { CodexLaunchDescriptor, SessionHostSessionOptions } from '@shared/types';
import { supportsProviderSessionResume } from '@shared/utils/agentInputMode';
import {
  buildSanitizedAgentCommand,
  buildTmuxAttachCommand,
  quotePosixShell,
} from '@shared/utils/codexNativeLaunch';
import {
  type AppRuntimeChannel,
  buildPersistentAgentHostSessionKey,
  resolveTmuxServerNameForPersistentAgentHostSessionKey,
} from '@shared/utils/runtimeIdentity';
import { buildShellCommandFromExecutablePath } from '@shared/utils/shellCommand';

export interface AgentLaunchCommand {
  shell: string;
  args: string[];
}

export interface BuildAgentLaunchPlanParams {
  agentCommand: string;
  customPath?: string;
  customArgs?: string;
  initialPrompt?: string;
  resumeSessionId?: string;
  initialized?: boolean;
  environment: 'native' | 'hapi' | 'happy';
  hapiGlobalInstalled: boolean | null;
  hapiCliApiToken?: string;
  isRemoteExecution: boolean;
  executionPlatform?: string;
  enableIdeIntegration?: boolean;
  tmuxEnabled?: boolean;
  resolvedShell: {
    shell: string;
    execArgs: string[];
  } | null;
  terminalSessionId?: string;
  persistentHostSessionKey?: string;
  persistentHostSessionAvailable?: boolean;
  runtimeChannel?: AppRuntimeChannel;
}

export interface AgentLaunchPlan {
  command?: AgentLaunchCommand;
  fallbackCommand?: AgentLaunchCommand;
  env?: Record<string, string>;
  initialCommand?: string;
  tmuxSessionName: string | null;
  hostSession?: SessionHostSessionOptions;
  codexLaunch?: CodexLaunchDescriptor;
}

function buildSessionResumeArgs(params: {
  agentCommand: string;
  resumeSessionId?: string;
  initialized?: boolean;
  terminalSessionId?: string;
  persistentHostSessionKey?: string;
  useTmuxHostSession?: boolean;
}): string[] {
  const {
    agentCommand,
    resumeSessionId,
    initialized,
    terminalSessionId,
    persistentHostSessionKey,
    useTmuxHostSession,
  } = params;
  if (!resumeSessionId) {
    return [];
  }

  if (!supportsProviderSessionResume(agentCommand)) {
    return [];
  }

  const hasExplicitProviderResumeId = isExplicitProviderResumeId({
    resumeSessionId,
    terminalSessionId,
    persistentHostSessionKey,
  });

  if (agentCommand === 'cursor-agent') {
    return hasExplicitProviderResumeId ? ['--resume', resumeSessionId] : [];
  }

  if (agentCommand === 'codex') {
    if (useTmuxHostSession) {
      return [];
    }
    return initialized && hasExplicitProviderResumeId ? ['resume', resumeSessionId] : [];
  }

  if (agentCommand.startsWith('claude')) {
    return initialized ? ['--resume', resumeSessionId] : ['--session-id', resumeSessionId];
  }

  return [];
}

function isExplicitProviderResumeId(params: {
  resumeSessionId?: string;
  terminalSessionId?: string;
  persistentHostSessionKey?: string;
}): boolean {
  const { resumeSessionId, terminalSessionId, persistentHostSessionKey } = params;
  return Boolean(
    resumeSessionId &&
      resumeSessionId !== terminalSessionId &&
      resumeSessionId !== persistentHostSessionKey
  );
}

function buildInteractiveShellExecArgs(shellPath: string): string[] | null {
  const shellName = shellPath.split('/').pop()?.toLowerCase() || '';

  if (shellName.includes('bash') || shellName.includes('zsh')) {
    return ['-i', '-l', '-c'];
  }
  if (shellName.includes('fish') || shellName.includes('nu')) {
    return ['-i', '-l', '-c'];
  }
  if (shellName.includes('sh')) {
    return ['-i', '-c'];
  }

  return null;
}

function ensureLocalUnixShellCommandArgs(shellPath: string, shellExecArgs: string[]): string[] {
  if (buildInteractiveShellExecArgs(shellPath) === null) {
    return shellExecArgs;
  }

  const hasCommandFlag = shellExecArgs.some((arg) => arg === '-c' || /^-[^-]*c/.test(arg));
  return hasCommandFlag ? shellExecArgs : [...shellExecArgs, '-c'];
}

function buildLocalUnixFallbackProbeCommands(params: {
  agentCommand: string;
  effectiveCommand: string;
  environment: 'native' | 'hapi' | 'happy';
  attachExistingTmuxSession: boolean;
  tmuxSessionName: string | null;
  hapiGlobalInstalled: boolean | null;
}): string[] {
  const commands = new Set<string>();
  const add = (command: string | undefined) => {
    if (!command || command.includes('/')) {
      return;
    }
    commands.add(command);
  };

  if (params.tmuxSessionName) {
    add('tmux');
  }

  if (params.attachExistingTmuxSession) {
    return [...commands];
  }

  if (params.environment === 'hapi') {
    add(params.hapiGlobalInstalled === false ? 'npx' : 'hapi');
  } else if (params.environment === 'happy') {
    add('happy');
  }

  add(params.effectiveCommand);

  if (params.agentCommand.startsWith('claude')) {
    add('claude');
  }

  return [...commands];
}

function wrapWithLocalUnixFallback(params: {
  finalCommand: string;
  shellPath: string;
  shellExecArgs: string[];
  probeCommands: string[];
}): AgentLaunchCommand {
  const interactiveExecArgs = buildInteractiveShellExecArgs(params.shellPath);
  const shellExecArgs = ensureLocalUnixShellCommandArgs(params.shellPath, params.shellExecArgs);
  if (interactiveExecArgs === null || params.probeCommands.length === 0) {
    return {
      shell: params.shellPath,
      args: [...shellExecArgs, params.finalCommand],
    };
  }

  const probeExpression = params.probeCommands
    .map((command) => `command -v ${command} >/dev/null 2>&1`)
    .join(' && ');
  const fallbackCommand = `${params.shellPath} ${interactiveExecArgs.join(' ')} ${quotePosixShell(params.finalCommand)}`;
  const requiresInlineExecution =
    params.finalCommand.includes(';') ||
    params.finalCommand.includes('\n') ||
    params.finalCommand.includes('&&') ||
    params.finalCommand.includes('||');
  const primaryCommand = requiresInlineExecution
    ? params.finalCommand
    : `exec ${params.finalCommand}`;
  const bootstrapCommand = `if ${probeExpression}; then ${primaryCommand}; else exec ${fallbackCommand}; fi`;

  return {
    shell: params.shellPath,
    args: [...shellExecArgs, bootstrapCommand],
  };
}

function shouldUseDirectLocalUnixLaunch(params: {
  environment: 'native' | 'hapi' | 'happy';
  isRemoteExecution: boolean;
  isWindows: boolean;
  tmuxSessionName: string | null;
  customArgs?: string;
  initialPrompt?: string;
}): boolean {
  return (
    params.environment === 'native' &&
    !params.isRemoteExecution &&
    !params.isWindows &&
    !params.tmuxSessionName &&
    !params.customArgs &&
    !params.initialPrompt
  );
}

function escapeInitialPromptForWindows(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '``')
    .replace(/%/g, '%%')
    .replace(/\$/g, '`$')
    .replace(/\n/g, ' ');
}

function resolveCommandShellPath(
  resolvedShell: BuildAgentLaunchPlanParams['resolvedShell'],
  executionPlatform?: string
): string {
  if (resolvedShell?.shell) {
    return resolvedShell.shell;
  }

  return executionPlatform === 'win32' ? 'powershell.exe' : '/bin/sh';
}

function escapeInitialPromptForUnix(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

export function buildAgentLaunchPlan({
  agentCommand,
  customPath,
  customArgs,
  initialPrompt,
  resumeSessionId,
  initialized,
  environment,
  hapiGlobalInstalled,
  hapiCliApiToken,
  isRemoteExecution,
  executionPlatform,
  enableIdeIntegration = agentCommand.startsWith('claude'),
  tmuxEnabled = false,
  resolvedShell,
  terminalSessionId,
  persistentHostSessionKey,
  persistentHostSessionAvailable = true,
  runtimeChannel = 'prod',
}: BuildAgentLaunchPlanParams): AgentLaunchPlan {
  if (!isRemoteExecution && !resolvedShell) {
    return {
      command: undefined,
      env: undefined,
      initialCommand: undefined,
      tmuxSessionName: null,
    };
  }

  const effectiveCommand = customPath || agentCommand;
  const supportIde = agentCommand.startsWith('claude') && enableIdeIntegration;
  const isWindows = executionPlatform === 'win32';
  const useTmuxHostSession =
    tmuxEnabled &&
    persistentHostSessionAvailable &&
    !isRemoteExecution &&
    !isWindows &&
    Boolean(terminalSessionId);
  const hasProviderResumeId = isExplicitProviderResumeId({
    resumeSessionId,
    terminalSessionId,
    persistentHostSessionKey,
  });

  if (
    tmuxEnabled &&
    !persistentHostSessionAvailable &&
    agentCommand === 'codex' &&
    initialized &&
    !hasProviderResumeId
  ) {
    return {
      command: undefined,
      env: undefined,
      initialCommand: undefined,
      tmuxSessionName: null,
    };
  }

  const agentArgs = buildSessionResumeArgs({
    agentCommand,
    resumeSessionId,
    initialized,
    terminalSessionId,
    persistentHostSessionKey,
    useTmuxHostSession,
  });

  if (supportIde) {
    agentArgs.push('--ide');
  }

  if (customArgs) {
    agentArgs.push(customArgs);
  }

  if (initialPrompt) {
    if (isWindows) {
      agentArgs.push(`"${escapeInitialPromptForWindows(initialPrompt)}"`);
    } else {
      agentArgs.push(`$'${escapeInitialPromptForUnix(initialPrompt)}'`);
    }
  }

  let envVars: Record<string, string> | undefined;
  const joinedAgentArgs = agentArgs.join(' ');
  const commandShellPath = resolveCommandShellPath(resolvedShell, executionPlatform);
  const codexExecutableName = effectiveCommand.replace(/\\/g, '/').split('/').at(-1)?.toLowerCase();
  const unsafeShellExpression = /[;&|<>\x60\n\r]|\$\(/;
  const canDescribeCodexLaunch =
    agentCommand === 'codex' &&
    ['codex', 'codex.exe', 'codex.cmd', 'codex.bat'].includes(codexExecutableName ?? '') &&
    !unsafeShellExpression.test(customArgs ?? '') &&
    !unsafeShellExpression.test(resumeSessionId ?? '') &&
    (isRemoteExecution || !/sqlite_home\s*=/.test(customArgs ?? ''));
  const describeCodexLaunch = (
    layout: Extract<CodexLaunchDescriptor, { kind: 'native' }>['layout'],
    shellArgsPrefix?: string[],
    fallbackArgsPrefix?: string[]
  ): CodexLaunchDescriptor | undefined =>
    !canDescribeCodexLaunch
      ? undefined
      : environment === 'native'
        ? {
            kind: 'native',
            executable: effectiveCommand,
            shellPath: commandShellPath,
            executionPlatform,
            rawArgs: [...agentArgs],
            layout,
            ...(shellArgsPrefix ? { shellArgsPrefix } : {}),
            ...(fallbackArgsPrefix ? { fallbackArgsPrefix } : {}),
          }
        : undefined;
  const buildCommandWithCustomPath = (rawArgs: string[]) =>
    buildShellCommandFromExecutablePath({
      shellPath: commandShellPath,
      executionPlatform,
      executablePath: customPath ?? effectiveCommand,
      rawArgs,
    });
  let baseCommand = customPath
    ? buildCommandWithCustomPath(agentArgs)
    : `${effectiveCommand} ${joinedAgentArgs}`.trim();

  if (environment === 'hapi') {
    if (hapiGlobalInstalled === null) {
      return {
        command: undefined,
        env: undefined,
        initialCommand: undefined,
        tmuxSessionName: null,
      };
    }
    const hapiPrefix = hapiGlobalInstalled ? 'hapi' : 'npx -y @twsxtd/hapi';
    const hapiArgs = agentCommand.startsWith('claude')
      ? ''
      : customPath
        ? buildCommandWithCustomPath([])
        : effectiveCommand;
    baseCommand = `${hapiPrefix} ${hapiArgs} ${joinedAgentArgs}`.trim();
    if (hapiCliApiToken) {
      envVars = { CLI_API_TOKEN: hapiCliApiToken };
    }
  }

  if (environment === 'happy') {
    const happyArgs = agentCommand.startsWith('claude')
      ? ''
      : customPath
        ? buildCommandWithCustomPath([])
        : effectiveCommand;
    baseCommand = `happy ${happyArgs} ${joinedAgentArgs}`.trim();
  }

  const shouldUseTmux = useTmuxHostSession;
  const tmuxSessionName = shouldUseTmux
    ? persistentHostSessionKey?.trim() ||
      buildPersistentAgentHostSessionKey(terminalSessionId ?? '', runtimeChannel)
    : null;
  const attachExistingTmuxSession = Boolean(shouldUseTmux && persistentHostSessionKey?.trim());
  const tmuxServerName =
    tmuxSessionName === null
      ? null
      : resolveTmuxServerNameForPersistentAgentHostSessionKey(tmuxSessionName, runtimeChannel);
  const hostSession =
    tmuxSessionName === null || tmuxServerName === null
      ? undefined
      : {
          kind: 'tmux' as const,
          serverName: tmuxServerName,
          sessionName: tmuxSessionName,
          mode: attachExistingTmuxSession
            ? ('attach-existing' as const)
            : ('create-if-missing' as const),
        };

  let finalCommand = baseCommand;
  if (tmuxSessionName && tmuxServerName) {
    finalCommand = buildTmuxAttachCommand(baseCommand, tmuxServerName, tmuxSessionName, {
      createIfMissing: !attachExistingTmuxSession,
      sessionEnvironmentVariableNames:
        agentCommand === 'codex' && !isRemoteExecution
          ? [
              'CODEX_HOME',
              ...(environment === 'native' ? ['CODEX_SQLITE_HOME'] : []),
              'INFILUX_MANAGED_CODEX_RUNTIME_HOME',
            ]
          : agentCommand === 'gemini'
            ? ['GEMINI_CLI_HOME', 'INFILUX_MANAGED_GEMINI_RUNTIME_HOME']
            : [],
    });
  }

  if (isRemoteExecution) {
    return {
      command: undefined,
      env: envVars,
      initialCommand: finalCommand,
      tmuxSessionName,
      ...(environment === 'native' && canDescribeCodexLaunch
        ? { codexLaunch: describeCodexLaunch('remote') }
        : {}),
      ...(hostSession ? { hostSession } : {}),
    };
  }

  if (!resolvedShell) {
    return {
      command: undefined,
      env: envVars,
      initialCommand: undefined,
      tmuxSessionName,
      ...(hostSession ? { hostSession } : {}),
    };
  }

  const shellName = resolvedShell.shell.toLowerCase();
  if (shellName.includes('wsl') && isWindows) {
    const escapedCommand = finalCommand.replace(/"/g, '\\"');
    return {
      command: {
        shell: 'wsl.exe',
        args: ['-e', 'sh', '-lc', `exec "$SHELL" -ilc "${escapedCommand}"`],
      },
      env: envVars,
      initialCommand: undefined,
      tmuxSessionName,
      ...(hostSession ? { hostSession } : {}),
    };
  }

  if (shellName.includes('powershell') || shellName.includes('pwsh')) {
    const powershellArgs = [...resolvedShell.execArgs, `& { ${finalCommand} }`];
    const nativeCodexLaunch = describeCodexLaunch('powershell', resolvedShell.execArgs);
    return {
      command: {
        shell: resolvedShell.shell,
        args: powershellArgs,
      },
      fallbackCommand: undefined,
      env: envVars,
      initialCommand: undefined,
      tmuxSessionName,
      ...(nativeCodexLaunch
        ? { codexLaunch: nativeCodexLaunch }
        : canDescribeCodexLaunch && environment !== 'native'
          ? {
              codexLaunch: {
                kind: 'wrapper' as const,
                environment,
                originalShell: resolvedShell.shell,
                originalArgs: powershellArgs,
              },
            }
          : {}),
      ...(hostSession ? { hostSession } : {}),
    };
  }

  if (
    shouldUseDirectLocalUnixLaunch({
      environment,
      isRemoteExecution,
      isWindows,
      tmuxSessionName,
      customArgs,
      initialPrompt,
    })
  ) {
    const fallbackArgsPrefix = ensureLocalUnixShellCommandArgs(
      resolvedShell.shell,
      resolvedShell.execArgs
    );
    return {
      command: {
        shell: effectiveCommand,
        args: [...agentArgs],
      },
      fallbackCommand: {
        shell: resolvedShell.shell,
        args: [...fallbackArgsPrefix, finalCommand],
      },
      env: envVars,
      initialCommand: undefined,
      tmuxSessionName,
      ...(describeCodexLaunch('direct', undefined, fallbackArgsPrefix)
        ? { codexLaunch: describeCodexLaunch('direct', undefined, fallbackArgsPrefix) }
        : {}),
      ...(hostSession ? { hostSession } : {}),
    };
  }

  if (agentCommand === 'codex' && environment === 'native' && !isRemoteExecution && !isWindows) {
    const nativeCodexLaunch = describeCodexLaunch(
      tmuxSessionName ? (attachExistingTmuxSession ? 'tmux-attach' : 'tmux') : 'initial'
    );
    return {
      command: undefined,
      fallbackCommand: undefined,
      env: envVars,
      initialCommand: buildSanitizedAgentCommand(finalCommand),
      tmuxSessionName,
      ...(nativeCodexLaunch ? { codexLaunch: nativeCodexLaunch } : {}),
      ...(hostSession ? { hostSession } : {}),
    };
  }

  const probeCommands = buildLocalUnixFallbackProbeCommands({
    agentCommand,
    effectiveCommand,
    environment,
    attachExistingTmuxSession,
    tmuxSessionName,
    hapiGlobalInstalled,
  });

  const wrappedCommand = wrapWithLocalUnixFallback({
    finalCommand,
    shellPath: resolvedShell.shell,
    shellExecArgs: resolvedShell.execArgs,
    probeCommands,
  });
  return {
    command: wrappedCommand,
    fallbackCommand: undefined,
    env: envVars,
    initialCommand: undefined,
    tmuxSessionName,
    ...(canDescribeCodexLaunch && environment !== 'native'
      ? {
          codexLaunch: {
            kind: 'wrapper' as const,
            environment,
            originalShell: wrappedCommand.shell,
            originalArgs: wrappedCommand.args,
            ...(hostSession ? { originalHostSession: hostSession } : {}),
          },
        }
      : {}),
    ...(hostSession ? { hostSession } : {}),
  };
}
