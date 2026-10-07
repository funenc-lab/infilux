import { execFileSync } from 'node:child_process';
import type { SessionCreateOptions } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { applyCodexSqliteLaunchOptions } from '../CodexSqliteLaunchOptions';

const sqliteHome = '/tmp/work tree/quotes " and apostrophe \'/sqlite';
const assignment = `sqlite_home=${JSON.stringify(sqliteHome)}`;

function apply(options: SessionCreateOptions): SessionCreateOptions {
  return applyCodexSqliteLaunchOptions(options, sqliteHome);
}

describe('applyCodexSqliteLaunchOptions', () => {
  it('passes the SQLite override as separate CLI arguments before resume', () => {
    const original: SessionCreateOptions = {
      kind: 'agent',
      shell: '/opt/codex',
      args: ['resume', 'thread-id'],
      fallbackArgs: ['-l', '-c', 'codex resume thread-id'],
    };

    const updated = apply(original);
    expect(updated.args).toEqual(['-c', assignment, 'resume', 'thread-id']);
    expect(updated.fallbackArgs?.at(-1)).toContain('codex -c ');
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
    const updated = apply({
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: 'env -u TMUX codex --profile fast',
      fallbackArgs: ['-l', '-c', 'codex resume thread-id'],
    });

    expect(updated.initialCommand).toContain('codex -c ');
    expect(updated.initialCommand).toContain(' --profile fast');
    expect(updated.initialCommand).toContain('\\"');
    expect(updated.initialCommand).toContain("apostrophe '");
    expect(updated.fallbackArgs?.at(-1)).toContain('codex -c ');
    if (process.platform !== 'win32') {
      const argumentsReceived = execFileSync(
        '/bin/sh',
        [
          '-c',
          `codex() { printf '%s\\n' "$@"; }; ${updated.initialCommand?.replace(/^env -u TMUX /, '')}`,
        ],
        { encoding: 'utf8' }
      )
        .trim()
        .split('\n');
      expect(argumentsReceived).toEqual(['-c', assignment, '--profile', 'fast']);
    }
  });

  it('escapes apostrophes when injecting into a tmux single-quoted command', () => {
    const updated = apply({
      kind: 'agent',
      shell: '/bin/zsh',
      initialCommand: "tmux new-session -d -s example 'true; codex resume thread-id'",
      hostSession: {
        kind: 'tmux',
        serverName: 'infilux',
        sessionName: 'example',
        mode: 'create-if-missing',
      },
    });

    expect(updated.initialCommand).toContain("apostrophe '\\''");
    expect(updated.initialCommand).toContain('codex -c ');
    expect(updated.initialCommand).toContain('resume thread-id');
    if (process.platform !== 'win32') {
      const argumentsReceived = execFileSync(
        '/bin/sh',
        [
          '-c',
          `tmux() { for last; do :; done; eval "$last"; }; codex() { printf '%s\\n' "$@"; }; ${updated.initialCommand}`,
        ],
        { encoding: 'utf8' }
      )
        .trim()
        .split('\n');
      expect(argumentsReceived).toEqual(['-c', assignment, 'resume', 'thread-id']);
    }
  });

  it('injects PowerShell executable commands using PowerShell-safe quoting', () => {
    const updated = apply({
      kind: 'agent',
      shell: 'pwsh.exe',
      args: [
        '-NoLogo',
        '-Command',
        "& { & 'C:\\Program Files\\OpenAI\\codex.exe' resume thread-id }",
      ],
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

  it('fails closed for a custom launcher that cannot enforce the worktree SQLite override', () => {
    expect(() =>
      apply({ kind: 'agent', shell: '/opt/custom-wrapper', args: ['--launch', 'codex'] })
    ).toThrow('Codex SQLite override could not match the current session launch shape');
  });

  it('rejects a conflicting sqlite_home inside a custom shell command', () => {
    expect(() =>
      apply({ kind: 'agent', shell: '/bin/zsh', initialCommand: 'codex -c sqlite_home="/other"' })
    ).toThrow('conflicting custom sqlite_home argument');
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
    ).toThrow('multiple Codex commands');
  });

  it('rejects a shell command that only prints the Codex executable name', () => {
    expect(() => apply({ kind: 'agent', shell: '/bin/zsh', initialCommand: 'echo codex' })).toThrow(
      'unsupported custom launcher'
    );
  });
});
