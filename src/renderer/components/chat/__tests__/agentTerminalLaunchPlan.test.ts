import { describe, expect, it, vi } from 'vitest';
import { resolveAgentTerminalLaunchPlan } from '../agentTerminalLaunchPlan';

const baseInput = {
  isReadOnlyTranscript: false,
  agentCommand: 'codex',
  resumeSessionId: 'provider-session-1',
  initialized: true,
  environment: 'native' as const,
  hapiGlobalInstalled: null,
  isRemoteExecution: false,
  executionPlatform: 'darwin',
  tmuxEnabled: true,
  resolvedShell: {
    shell: '/bin/zsh',
    execArgs: ['-lc'],
  },
  terminalSessionId: 'ui-session-1',
  persistentHostSessionKey: 'infilux-ui-session-1',
  runtimeChannel: 'prod' as const,
  onHostlessRetry: vi.fn(),
};

describe('resolveAgentTerminalLaunchPlan', () => {
  it('uses recovered tmux host sessions only for attach-existing recovery and prepares a hostless provider fallback', () => {
    const result = resolveAgentTerminalLaunchPlan({
      ...baseInput,
      recoveryState: 'live',
      shouldBypassHostSessionRecovery: false,
    });

    expect(result.hostSession).toEqual({
      kind: 'tmux',
      serverName: 'infilux',
      sessionName: 'infilux-ui-session-1',
      mode: 'attach-existing',
    });
    expect(result.sessionCreateFallback?.hostSession).toBeUndefined();
    expect(result.sessionCreateFallback?.command).toEqual({
      shell: 'codex',
      args: ['resume', 'provider-session-1'],
      fallbackCommand: {
        shell: '/bin/zsh',
        args: ['-lc', 'codex resume provider-session-1'],
      },
    });
  });

  it('does not attach a missing recovered tmux host session while provider validation is pending', () => {
    const result = resolveAgentTerminalLaunchPlan({
      ...baseInput,
      resumeSessionId: 'infilux-ui-session-1',
      recoveryState: 'missing-host-session',
      shouldBypassHostSessionRecovery: true,
    });

    expect(result.hostSession).toBeUndefined();
    expect(result.command).toBeUndefined();
    expect(result.initialCommand).toBeUndefined();
    expect(result.sessionCreateFallback).toBeUndefined();
  });
});
