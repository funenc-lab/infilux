import { describe, expect, it } from 'vitest';
import { buildAgentLaunchPlan } from '../agentLaunchPlan';

describe('buildAgentLaunchPlan', () => {
  it('returns an empty plan when local execution has no resolved shell', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'claude',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'linux',
      resolvedShell: null,
    });

    expect(plan).toEqual({
      command: undefined,
      env: undefined,
      initialCommand: undefined,
      tmuxSessionName: null,
    });
  });

  it('does not wrap remote agent commands in tmux', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'claude',
      resumeSessionId: 'session-1',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: true,
      executionPlatform: 'linux',
      resolvedShell: null,
      terminalSessionId: 'ui-session-1',
    });

    expect(plan.command).toBeUndefined();
    expect(plan.tmuxSessionName).toBeNull();
    expect(plan.initialCommand).toContain('claude --session-id session-1 --ide');
    expect(plan.initialCommand).not.toContain('tmux -L enso');
  });

  it('skips the Claude IDE flag when IDE integration is unavailable', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'claude',
      resumeSessionId: 'session-1',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      enableIdeIntegration: false,
      resolvedShell: {
        shell: '/bin/zsh',
        execArgs: ['-lc'],
      },
    });

    expect(plan.command).toEqual({
      shell: 'claude',
      args: ['--session-id', 'session-1'],
    });
    expect(plan.fallbackCommand).toEqual({
      shell: '/bin/zsh',
      args: ['-lc', 'claude --session-id session-1'],
    });
  });

  it('keeps tmux wrapping for local unix agent sessions', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'claude',
      resumeSessionId: 'session-1',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      resolvedShell: {
        shell: '/bin/zsh',
        execArgs: ['-lc'],
      },
      terminalSessionId: 'ui-session-1',
    });

    expect(plan.tmuxSessionName).toBe('enso-ui-session-1');
    expect(plan.command?.shell).toBe('/bin/zsh');
    expect(plan.command?.args[0]).toBe('-lc');
    expect(plan.command?.args[1]).toContain('command -v tmux >/dev/null 2>&1');
    expect(plan.command?.args[1]).toContain('command -v claude >/dev/null 2>&1');
    expect(plan.command?.args[1]).toContain(
      "then env -u TMUX tmux -L enso -f /dev/null new-session -d -s enso-ui-session-1 'env -u NO_COLOR -u COLOR -u CLICOLOR -u CLICOLOR_FORCE claude --session-id session-1 --ide' >/dev/null 2>&1 || true;"
    );
    expect(plan.command?.args[1]).not.toContain(
      "then exec env -u TMUX tmux -L enso -f /dev/null new-session -d -s enso-ui-session-1 'claude --session-id session-1 --ide' >/dev/null 2>&1 || true;"
    );
    expect(plan.command?.args[1]).toContain(
      "env -u TMUX tmux -L enso -f /dev/null new-session -d -s enso-ui-session-1 'env -u NO_COLOR -u COLOR -u CLICOLOR -u CLICOLOR_FORCE claude --session-id session-1 --ide' >/dev/null 2>&1 || true"
    );
    expect(plan.command?.args[1]).toContain(
      'env -u TMUX tmux -L enso set-option -t enso-ui-session-1 status off >/dev/null 2>&1 || true'
    );
    expect(plan.command?.args[1]).toContain(
      'env -u TMUX tmux -L enso set-option -t enso-ui-session-1 mouse off >/dev/null 2>&1 || true'
    );
    expect(plan.command?.args[1]).not.toContain(
      'env -u TMUX tmux -L enso set-option -t enso-ui-session-1 mouse on >/dev/null 2>&1 || true'
    );
    expect(plan.command?.args[1]).toContain(
      'exec env -u TMUX tmux -L enso attach-session -t enso-ui-session-1'
    );
    expect(plan.command?.args[1]).toContain('exec /bin/zsh -i -l -c');
  });

  it('does not wrap local unix agent sessions in tmux when tmux persistence is disabled', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'claude',
      resumeSessionId: 'session-1',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: false,
      resolvedShell: {
        shell: '/bin/zsh',
        execArgs: ['-lc'],
      },
      terminalSessionId: 'ui-session-1',
    });

    expect(plan.tmuxSessionName).toBeNull();
    expect(plan.command).toEqual({
      shell: 'claude',
      args: ['--session-id', 'session-1', '--ide'],
    });
    expect(plan.fallbackCommand).toEqual({
      shell: '/bin/zsh',
      args: ['-lc', 'claude --session-id session-1 --ide'],
    });
  });

  it('directly launches local unix agent commands and retains a shell fallback', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: {
        shell: '/bin/zsh',
        execArgs: ['-l', '-c'],
      },
    });

    expect(plan.command).toEqual({
      shell: 'codex',
      args: [],
    });
    expect(plan.fallbackCommand).toEqual({
      shell: '/bin/zsh',
      args: ['-l', '-c', 'codex'],
    });
  });

  it('resumes initialized codex sessions on local unix hosts', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      resumeSessionId: 'codex-session-9',
      initialized: true,
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: {
        shell: '/bin/zsh',
        execArgs: ['-l', '-c'],
      },
    });

    expect(plan.command).toEqual({
      shell: 'codex',
      args: ['resume', 'codex-session-9'],
    });
    expect(plan.fallbackCommand).toEqual({
      shell: '/bin/zsh',
      args: ['-l', '-c', 'codex resume codex-session-9'],
    });
  });

  it('does not resume codex with the ui session id when no provider session id was captured', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      resumeSessionId: 'ui-session-1',
      terminalSessionId: 'ui-session-1',
      initialized: true,
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: {
        shell: '/bin/zsh',
        execArgs: ['-l', '-c'],
      },
    });

    expect(plan.command).toEqual({
      shell: 'codex',
      args: [],
    });
    expect(plan.fallbackCommand).toEqual({
      shell: '/bin/zsh',
      args: ['-l', '-c', 'codex'],
    });
  });

  it('does not try to resume codex sessions before the first interactive run', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      resumeSessionId: 'codex-session-10',
      initialized: false,
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: {
        shell: '/bin/zsh',
        execArgs: ['-l', '-c'],
      },
    });

    expect(plan.command).toEqual({
      shell: 'codex',
      args: [],
    });
    expect(plan.fallbackCommand).toEqual({
      shell: '/bin/zsh',
      args: ['-l', '-c', 'codex'],
    });
  });

  it('keeps a login shell alive for local unix codex commands that need shell wrapping', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customArgs: '--dangerously-bypass-approvals-and-sandbox',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: {
        shell: '/bin/zsh',
        execArgs: ['-l', '-c'],
      },
    });

    expect(plan.command).toBeUndefined();
    expect(plan.fallbackCommand).toBeUndefined();
    expect(plan.initialCommand).toBe('codex --dangerously-bypass-approvals-and-sandbox');
  });

  it('returns an empty plan when hapi availability is still unknown', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'claude',
      environment: 'hapi',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'linux',
      resolvedShell: {
        shell: '/bin/zsh',
        execArgs: ['-lc'],
      },
    });

    expect(plan).toEqual({
      command: undefined,
      env: undefined,
      initialCommand: undefined,
      tmuxSessionName: null,
    });
  });

  it('builds a local hapi launch plan with env vars and unix prompt escaping', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'claude',
      customArgs: '--dangerously-skip-permissions',
      initialPrompt: "Fix path '\\src'\nnow",
      resumeSessionId: 'session-2',
      initialized: false,
      environment: 'hapi',
      hapiGlobalInstalled: false,
      hapiCliApiToken: 'token-123',
      isRemoteExecution: false,
      executionPlatform: 'linux',
      resolvedShell: {
        shell: '/bin/bash',
        execArgs: ['-lc'],
      },
    });

    expect(plan.tmuxSessionName).toBeNull();
    expect(plan.env).toEqual({ CLI_API_TOKEN: 'token-123' });
    expect(plan.command?.shell).toBe('/bin/bash');
    expect(plan.command?.args[0]).toBe('-lc');
    expect(plan.command?.args[1]).toContain('then exec npx -y @twsxtd/hapi');
    expect(plan.command?.args[1]).toContain('npx -y @twsxtd/hapi');
    expect(plan.command?.args[1]).toContain('--session-id session-2');
    expect(plan.command?.args[1]).toContain('--ide');
    expect(plan.command?.args[1]).toContain('--dangerously-skip-permissions');
    expect(plan.command?.args[1]).toContain("$'Fix path");
    expect(plan.command?.args[1]).toContain("\\nnow'");
  });

  it('builds a remote happy launch plan for non-claude agents', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath: '/opt/tools/codex',
      customArgs: '--profile fast',
      initialPrompt: 'Ship it',
      environment: 'happy',
      hapiGlobalInstalled: null,
      isRemoteExecution: true,
      executionPlatform: 'linux',
      resolvedShell: null,
    });

    expect(plan.command).toBeUndefined();
    expect(plan.env).toBeUndefined();
    expect(plan.tmuxSessionName).toBeNull();
    expect(plan.initialCommand).toBe("happy /opt/tools/codex --profile fast $'Ship it'");
  });

  it('wraps commands for wsl shells on windows', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'claude',
      resumeSessionId: 'session-3',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'win32',
      resolvedShell: {
        shell: 'C:/Windows/System32/wsl.exe',
        execArgs: [],
      },
    });

    expect(plan).toEqual({
      command: {
        shell: 'wsl.exe',
        args: ['-e', 'sh', '-lc', 'exec "$SHELL" -ilc "claude --session-id session-3 --ide"'],
      },
      env: undefined,
      initialCommand: undefined,
      tmuxSessionName: null,
    });
  });

  it('wraps windows powershell commands and escapes special prompt characters', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'cursor-agent',
      customArgs: '--model gpt-5',
      initialPrompt: 'say "hi" %PATH% $HOME `tick`\nnext',
      resumeSessionId: 'resume-7',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'win32',
      resolvedShell: {
        shell: 'pwsh.exe',
        execArgs: ['-NoLogo', '-Command'],
      },
    });

    expect(plan).toEqual({
      command: {
        shell: 'pwsh.exe',
        args: [
          '-NoLogo',
          '-Command',
          '& { cursor-agent --resume resume-7 --model gpt-5 "say \\"hi\\" %%PATH%% `$HOME ``tick`` next" }',
        ],
      },
      env: undefined,
      initialCommand: undefined,
      tmuxSessionName: null,
    });
  });

  it('does not resume cursor-agent with the ui session id when provider resume id is unknown', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'cursor-agent',
      resumeSessionId: 'ui-session-2',
      terminalSessionId: 'ui-session-2',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'win32',
      resolvedShell: {
        shell: 'pwsh.exe',
        execArgs: ['-NoLogo', '-Command'],
      },
    });

    expect(plan).toEqual({
      command: {
        shell: 'pwsh.exe',
        args: ['-NoLogo', '-Command', '& { cursor-agent }'],
      },
      env: undefined,
      initialCommand: undefined,
      tmuxSessionName: null,
    });
  });
});
