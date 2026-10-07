import { execFileSync } from 'node:child_process';
import type { SessionCreateOptions } from '@shared/types';
import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { describe, expect, it } from 'vitest';
import { buildAgentLaunchPlan } from '../../../../renderer/components/chat/agentLaunchPlan';
import {
  applyCodexSqliteLaunchOptions,
  isCodexThirdPartyWrapperLaunch,
} from '../CodexSqliteLaunchOptions';

const sqliteHome = '/tmp/work tree/quotes " and apostrophe \'/sqlite';
const assignment = `sqlite_home=${JSON.stringify(sqliteHome)}`;

function apply(options: SessionCreateOptions): SessionCreateOptions {
  return applyCodexSqliteLaunchOptions(options, sqliteHome);
}

describe('applyCodexSqliteLaunchOptions', () => {
  it('passes the SQLite override as separate CLI arguments before resume', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath: '/opt/codex',
      resumeSessionId: 'thread-id',
      terminalSessionId: 'ui-session',
      initialized: true,
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const original: SessionCreateOptions = {
      kind: 'agent',
      shell: plan.command?.shell,
      args: plan.command?.args,
      fallbackShell: plan.fallbackCommand?.shell,
      fallbackArgs: plan.fallbackCommand?.args,
      codexLaunch: plan.codexLaunch,
    };

    const updated = apply(original);
    expect(updated.args).toEqual(['-c', assignment, 'resume', 'thread-id']);
    expect(updated.fallbackArgs?.at(-1)).toContain('/opt/codex -c ');
    expect(updated.fallbackArgs?.at(-1)).toContain('resume thread-id');
    expect(original.args).toEqual(['resume', 'thread-id']);
    expect(apply(updated)).toEqual(updated);
  });

  it('overrides an earlier explicit sqlite_home CLI value and preserves unrelated config', () => {
    const updated = apply({
      kind: 'agent',
      shell: 'codex',
      args: ['-c', 'sqlite_home="/unscoped"', '-c', 'model="gpt-5"', 'resume'],
    });

    expect(updated.args).toEqual(['-c', 'model="gpt-5"', '-c', assignment, 'resume']);
  });

  it('quotes the entire assignment for POSIX shell commands with spaces, double and single quotes', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customArgs: '--profile fast',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const updated = apply({
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: plan.initialCommand,
      codexLaunch: plan.codexLaunch,
    });

    expect(updated.initialCommand).toContain('codex -c ');
    expect(updated.initialCommand).toContain(' --profile fast');
    expect(updated.initialCommand).toContain('\\"');
    expect(updated.initialCommand).toContain("apostrophe '");
    if (process.platform !== 'win32') {
      const argumentsReceived = execFileSync(
        '/bin/sh',
        [
          '-c',
          `codex() { printf '%s\\n' "$@"; }; ${updated.initialCommand?.replace(/^env .*? codex /, 'codex ')}`,
        ],
        { encoding: 'utf8' }
      )
        .trim()
        .split('\n');
      expect(argumentsReceived).toEqual(['-c', assignment, '--profile', 'fast']);
    }
  });

  it('escapes apostrophes when injecting into a tmux single-quoted command', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customArgs: 'resume thread-id',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-example',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const updated = apply({
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: plan.initialCommand,
      hostSession: plan.hostSession,
      codexLaunch: plan.codexLaunch,
    });

    expect(updated.initialCommand).toContain("apostrophe '\\''");
    expect(updated.initialCommand).toContain('codex -c ');
    expect(updated.initialCommand).toContain('resume thread-id');
    if (process.platform !== 'win32') {
      expect(() =>
        execFileSync('/bin/sh', ['-n', '-c', updated.initialCommand ?? ''])
      ).not.toThrow();
    }
  });

  it.each([
    '/tmp/work tree/sqlite',
    sqliteHome,
  ])('passes sqlite_home into the actual Codex process inside a native local tmux plan: %s', (sqliteHomePath) => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-session-native',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const updated = applyCodexSqliteLaunchOptions(
      {
        kind: 'agent',
        shell: '/bin/zsh',
        initialCommand: plan.initialCommand,
        hostSession: plan.hostSession,
        codexLaunch: plan.codexLaunch,
      },
      sqliteHomePath
    );

    const tmuxNewSessionPayload = updated.initialCommand?.match(
      /new-session -d .*? -s \S+ ('(?:[^']|'\\'')*')/
    )?.[1];
    expect(tmuxNewSessionPayload).toBeDefined();
    if (process.platform !== 'win32' && tmuxNewSessionPayload) {
      const args = execFileSync(
        '/bin/sh',
        [
          '-c',
          `env() { while [ "$1" = -u ]; do shift 2; done; "$@"; }; codex() { printf '%s\\n' "$@"; }; eval ${tmuxNewSessionPayload}`,
        ],
        { encoding: 'utf8' }
      )
        .trim()
        .split('\n');
      expect(args).toEqual(['-c', `sqlite_home=${JSON.stringify(sqliteHomePath)}`]);
    }
  });

  it('uses the renderer native executable position instead of words in a profile or prompt', () => {
    const executable = "/opt/OpenAI's Codex tools/codex";
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath: executable,
      customArgs: '--profile codex',
      initialPrompt: 'review codex output',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const updated = applyCodexSqliteLaunchOptions(
      {
        kind: 'agent',
        shell: '/bin/zsh',
        initialCommand: plan.initialCommand,
        codexLaunch: plan.codexLaunch,
      },
      sqliteHome
    );

    expect(updated.initialCommand).toContain(`'${executable.replace(/'/g, "'\\''")}' -c `);
    expect(updated.initialCommand).toContain(' --profile codex ');
    expect(updated.initialCommand).toContain('review codex output');
    if (process.platform !== 'win32') {
      expect(() =>
        execFileSync('/bin/sh', ['-n', '-c', updated.initialCommand ?? ''])
      ).not.toThrow();
    }
  });

  it('keeps the Codex CLI override inside the renderer tmux command when the prompt mentions codex', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath: "/opt/O'Brien's tools/codex",
      initialPrompt: 'inspect codex settings',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-shell-quoted',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const updated = applyCodexSqliteLaunchOptions(
      {
        kind: 'agent',
        shell: '/bin/zsh',
        initialCommand: plan.initialCommand,
        hostSession: plan.hostSession,
        codexLaunch: plan.codexLaunch,
      },
      sqliteHome
    );

    expect(updated.initialCommand).toContain('sqlite_home=');
    expect(updated.initialCommand).toContain('inspect codex settings');
    if (process.platform !== 'win32') {
      expect(() =>
        execFileSync('/bin/sh', ['-n', '-c', updated.initialCommand ?? ''])
      ).not.toThrow();
    }
  });

  it.each([
    false,
    true,
  ])('preserves ordinary sqlite_home text in native initial prompts (tmux: %s)', (tmuxEnabled) => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      initialPrompt: 'Explain why sqlite_home="not a config" is text',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled,
      terminalSessionId: 'ui-prompt',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const updated = apply({
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: plan.initialCommand,
      hostSession: plan.hostSession,
      codexLaunch: plan.codexLaunch,
    });

    expect(updated.initialCommand).toContain('sqlite_home=');
    expect(updated.initialCommand).toContain('Explain why');
    expect(updated.initialCommand).toContain('codex -c "sqlite_home=');
    if (!tmuxEnabled) {
      expect(updated.initialCommand).toContain(`-c "${assignment.replace(/["\\$\x60]/g, '\\$&')}"`);
    }
  });

  it('still enforces native direct Codex argv when stale wrapper metadata is present', () => {
    const updated = applyCodexSqliteLaunchOptions(
      {
        kind: 'agent',
        shell: 'codex',
        args: ['resume', 'thread-id'],
        metadata: { environment: 'hapi' },
      },
      '/tmp/codex-worktree/sqlite'
    );

    expect(updated.args).toEqual([
      '-c',
      'sqlite_home="/tmp/codex-worktree/sqlite"',
      'resume',
      'thread-id',
    ]);
  });

  it('injects PowerShell executable commands using PowerShell-safe quoting', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customPath: 'C:\\Program Files\\OpenAI\\codex.exe',
      resumeSessionId: 'thread-id',
      terminalSessionId: 'ui-powershell',
      initialized: true,
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'win32',
      resolvedShell: { shell: 'pwsh.exe', execArgs: ['-NoLogo', '-Command'] },
    });
    const updated = apply({
      kind: 'agent',
      shell: 'pwsh.exe',
      args: plan.command?.args,
      codexLaunch: plan.codexLaunch,
    });

    expect(updated.args?.at(-1)).toContain("codex.exe' -c 'sqlite_home=");
    expect(updated.args?.at(-1)).toContain("apostrophe ''");
  });

  it('does not inject another override when attaching to a running tmux host', () => {
    const options: SessionCreateOptions = {
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: 'tmux attach-session -t existing',
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'existing',
        mode: 'attach-existing',
      },
    };
    expect(apply(options)).toEqual(options);
  });

  it('refuses a local SQLite override on a typed remote capability-only launch', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: true,
      executionPlatform: 'linux',
      resolvedShell: null,
    });

    expect(() =>
      apply({
        kind: 'agent',
        cwd: toRemoteVirtualPath('connection-1', '/srv/worktree'),
        initialCommand: plan.initialCommand,
        codexLaunch: plan.codexLaunch,
      })
    ).toThrow('unsupported custom launcher');
  });

  it('fails closed for a custom launcher that cannot enforce the worktree SQLite override', () => {
    expect(() =>
      apply({ kind: 'agent', shell: '/opt/custom-wrapper', args: ['--launch', 'codex'] })
    ).toThrow('Codex SQLite override could not match the current session launch shape');
  });

  it('rejects a conflicting sqlite_home inside a custom shell command', () => {
    expect(() =>
      apply({ kind: 'agent', shell: '/bin/zsh', initialCommand: 'codex -c sqlite_home="/other"' })
    ).toThrow('unsupported custom launcher');
  });

  it('still rejects a custom sqlite_home argument when an ordinary initial prompt is present', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customArgs: '-c sqlite_home="/another-worktree"',
      initialPrompt: 'This is ordinary text',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });

    expect(plan.codexLaunch).toBeUndefined();
    expect(() =>
      apply({ kind: 'agent', shell: '/bin/zsh', initialCommand: plan.initialCommand })
    ).toThrow('unsupported custom launcher');
  });

  it('does not accept a custom sqlite_home config arg disguised as a renderer prompt', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      customArgs: '-c sqlite_home="/another-worktree"',
      environment: 'native',
      hapiGlobalInstalled: null,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const customArg = '-c sqlite_home="/another-worktree"';

    expect(() =>
      apply({
        kind: 'agent',
        shell: '/bin/zsh',
        initialCommand: plan.initialCommand,
        codexLaunch: {
          kind: 'native',
          executable: 'codex',
          shellPath: '/bin/zsh',
          executionPlatform: 'darwin',
          rawArgs: [customArg],
          initialPromptArg: customArg,
          layout: 'initial',
        },
      })
    ).toThrow('unsupported custom launcher');
  });

  it('rejects a shell probe that could receive the override instead of the real Codex process', () => {
    expect(() =>
      apply({
        kind: 'agent',
        shell: '/bin/zsh',
        args: [
          '-l',
          '-c',
          "if command -v codex >/dev/null; then exec codex --profile fast; else exec zsh -lc 'codex'; fi",
        ],
      })
    ).toThrow('unsupported custom launcher');
  });

  it('does not mistake an unrelated multi-Codex shell launcher for a built-in Hapi wrapper', () => {
    const options: SessionCreateOptions = {
      kind: 'agent',
      shell: '/bin/zsh',
      args: [
        '-l',
        '-c',
        'if command -v codex >/dev/null; then exec codex; else exec hapi codex; fi',
      ],
    };

    expect(isCodexThirdPartyWrapperLaunch(options)).toBe(false);
    expect(() => applyCodexSqliteLaunchOptions(options, '/tmp/sqlite')).toThrow(
      'Codex SQLite override could not match the current session launch shape'
    );
  });

  it('rejects a built-in wrapper plan with a custom second Codex command', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment: 'hapi',
      hapiGlobalInstalled: true,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      tmuxEnabled: true,
      terminalSessionId: 'ui-custom-wrapper',
      customArgs: '--profile fast; codex;',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });
    const options: SessionCreateOptions = {
      kind: 'agent',
      shell: plan.command?.shell,
      args: plan.command?.args,
      hostSession: plan.hostSession,
    };

    expect(isCodexThirdPartyWrapperLaunch(options)).toBe(false);
    expect(() => applyCodexSqliteLaunchOptions(options, '/tmp/sqlite')).toThrow(
      'Codex SQLite override could not match the current session launch shape'
    );
  });

  it('rejects a shell command that only prints the Codex executable name', () => {
    expect(() => apply({ kind: 'agent', shell: '/bin/zsh', initialCommand: 'echo codex' })).toThrow(
      'unsupported custom launcher'
    );
  });

  it('does not infer a safe Codex executable position from an untrusted shell string', () => {
    expect(() =>
      apply({
        kind: 'agent',
        shell: '/bin/zsh',
        initialCommand: 'env -u TMUX codex --profile fast',
      })
    ).toThrow('unsupported custom launcher');
  });

  it('rejects a malformed native launch descriptor using the standard unsupported-launch warning', () => {
    const options: SessionCreateOptions = {
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: 'env -u TMUX codex',
      codexLaunch: {
        kind: 'native',
        executable: 'codex',
        shellPath: '/bin/zsh',
        layout: 'initial',
        rawArgs: JSON.parse('{"unexpected":"shell arg"}'),
      },
    };

    expect(() => apply(options)).toThrow('unsupported custom launcher');
  });

  it('does not infer built-in wrapper provenance from a serialized shell command', () => {
    const plan = buildAgentLaunchPlan({
      agentCommand: 'codex',
      environment: 'hapi',
      hapiGlobalInstalled: true,
      isRemoteExecution: false,
      executionPlatform: 'darwin',
      resolvedShell: { shell: '/bin/zsh', execArgs: ['-l', '-c'] },
    });

    expect(
      isCodexThirdPartyWrapperLaunch({
        kind: 'agent',
        shell: plan.command?.shell,
        args: plan.command?.args,
      })
    ).toBe(false);
  });
});
