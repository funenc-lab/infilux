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
  tmuxEnabled?: boolean;
  resolvedShell: {
    shell: string;
    execArgs: string[];
  } | null;
  terminalSessionId?: string;
}

export interface AgentLaunchPlan {
  command?: AgentLaunchCommand;
  env?: Record<string, string>;
  initialCommand?: string;
  tmuxSessionName: string | null;
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
  tmuxEnabled = false,
  resolvedShell,
  terminalSessionId,
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
  const supportsSession = agentCommand.startsWith('claude') || agentCommand === 'cursor-agent';
  const supportIde = agentCommand.startsWith('claude');
  const isWindows = executionPlatform === 'win32';

  const agentArgs: string[] = [];
  if (supportsSession && resumeSessionId) {
    if (agentCommand === 'cursor-agent' || initialized) {
      agentArgs.push('--resume', resumeSessionId);
    } else {
      agentArgs.push('--session-id', resumeSessionId);
    }
  }

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
  let baseCommand = `${effectiveCommand} ${agentArgs.join(' ')}`.trim();

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
    const hapiArgs = agentCommand.startsWith('claude') ? '' : effectiveCommand;
    baseCommand = `${hapiPrefix} ${hapiArgs} ${agentArgs.join(' ')}`.trim();
    if (hapiCliApiToken) {
      envVars = { CLI_API_TOKEN: hapiCliApiToken };
    }
  }

  if (environment === 'happy') {
    const happyArgs = agentCommand.startsWith('claude') ? '' : effectiveCommand;
    baseCommand = `happy ${happyArgs} ${agentArgs.join(' ')}`.trim();
  }

  const shouldUseTmux =
    tmuxEnabled && !isRemoteExecution && !isWindows && Boolean(terminalSessionId);
  const tmuxSessionName = shouldUseTmux
    ? `enso-${terminalSessionId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
    : null;

  let finalCommand = baseCommand;
  if (tmuxSessionName) {
    const escaped = baseCommand.replace(/'/g, "'\\''");
    finalCommand = `env -u TMUX tmux -L enso -f /dev/null new-session -A -s ${tmuxSessionName} '${escaped}'`;
  }

  if (isRemoteExecution) {
    return {
      command: undefined,
      env: envVars,
      initialCommand: finalCommand,
      tmuxSessionName,
    };
  }

  if (!resolvedShell) {
    return {
      command: undefined,
      env: envVars,
      initialCommand: undefined,
      tmuxSessionName,
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
    };
  }

  if (shellName.includes('powershell') || shellName.includes('pwsh')) {
    return {
      command: {
        shell: resolvedShell.shell,
        args: [...resolvedShell.execArgs, `& { ${finalCommand} }`],
      },
      env: envVars,
      initialCommand: undefined,
      tmuxSessionName,
    };
  }

  return {
    command: {
      shell: resolvedShell.shell,
      args: [...resolvedShell.execArgs, finalCommand],
    },
    env: envVars,
    initialCommand: undefined,
    tmuxSessionName,
  };
}
