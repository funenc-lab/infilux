import type { SessionHostSessionOptions } from '@shared/types';
import { AGENT_TMUX_UNSET_ENV_KEYS, buildEnvUnsetPrefix } from '@shared/utils/agentEnvironment';
import { supportsProviderSessionResume } from '@shared/utils/agentInputMode';
import {
  type AppRuntimeChannel,
  buildPersistentAgentHostSessionKey,
  resolveTmuxServerNameForPersistentAgentHostSessionKey,
} from '@shared/utils/runtimeIdentity';
import { buildShellCommandFromExecutablePath } from '@shared/utils/shellCommand';
import {
  buildManagedTmuxSocketShellDir,
  buildManagedTmuxSocketShellPath,
} from '@shared/utils/tmux';

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

function quotePosixShell(input: string): string {
  return `'${input.replace(/'/g, "'\\''")}'`;
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
  if (interactiveExecArgs === null || params.probeCommands.length === 0) {
    return {
      shell: params.shellPath,
      args: [...params.shellExecArgs, params.finalCommand],
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
    args: [...params.shellExecArgs, bootstrapCommand],
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

function buildTmuxSessionCommand(baseCommand: string): string {
  return buildSanitizedAgentCommand(baseCommand);
}

function buildSanitizedAgentCommand(baseCommand: string): string {
  return `env ${buildEnvUnsetPrefix(AGENT_TMUX_UNSET_ENV_KEYS)} ${baseCommand}`.trim();
}

function buildTmuxSessionEnvironmentArgs(variableNames: readonly string[]): string {
  return variableNames.map((variableName) => `-e ${variableName}="\${${variableName}}"`).join(' ');
}

function buildTmuxAttachCommand(
  baseCommand: string,
  tmuxServerName: string,
  tmuxSessionName: string,
  options: {
    createIfMissing: boolean;
    sessionEnvironmentVariableNames: readonly string[];
  }
): string {
  const tmuxSocketDir = buildManagedTmuxSocketShellDir();
  const tmuxSocketPath = buildManagedTmuxSocketShellPath(tmuxServerName);
  const quotedBaseCommand = quotePosixShell(buildTmuxSessionCommand(baseCommand));
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
      sessionEnvironmentVariableNames: agentCommand === 'codex' ? ['CODEX_HOME'] : [],
    });
  }

  if (isRemoteExecution) {
    return {
      command: undefined,
      env: envVars,
      initialCommand: finalCommand,
      tmuxSessionName,
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
    return {
      command: {
        shell: resolvedShell.shell,
        args: [...resolvedShell.execArgs, `& { ${finalCommand} }`],
      },
      fallbackCommand: undefined,
      env: envVars,
      initialCommand: undefined,
      tmuxSessionName,
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
    return {
      command: {
        shell: effectiveCommand,
        args: [...agentArgs],
      },
      fallbackCommand: {
        shell: resolvedShell.shell,
        args: [...resolvedShell.execArgs, finalCommand],
      },
      env: envVars,
      initialCommand: undefined,
      tmuxSessionName,
      ...(hostSession ? { hostSession } : {}),
    };
  }

  if (agentCommand === 'codex' && environment === 'native' && !isRemoteExecution && !isWindows) {
    return {
      command: undefined,
      fallbackCommand: undefined,
      env: envVars,
      initialCommand: buildSanitizedAgentCommand(finalCommand),
      tmuxSessionName,
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

  return {
    command: wrapWithLocalUnixFallback({
      finalCommand,
      shellPath: resolvedShell.shell,
      shellExecArgs: resolvedShell.execArgs,
      probeCommands,
    }),
    fallbackCommand: undefined,
    env: envVars,
    initialCommand: undefined,
    tmuxSessionName,
    ...(hostSession ? { hostSession } : {}),
  };
}
