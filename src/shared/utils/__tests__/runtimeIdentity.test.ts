import { describe, expect, it } from 'vitest';
import {
  buildAppRuntimeIdentity,
  buildPersistentAgentHostSessionKey,
  encodeRuntimeChannelArgument,
  parseRuntimeChannelFromArgv,
  resolveAppRuntimeChannel,
} from '../runtimeIdentity';

describe('runtime identity utilities', () => {
  it('encodes and parses runtime channel arguments', () => {
    expect(encodeRuntimeChannelArgument('dev')).toBe('--infilux-runtime-channel=dev');
    expect(parseRuntimeChannelFromArgv(['--flag', '--infilux-runtime-channel=test'])).toBe('test');
    expect(parseRuntimeChannelFromArgv(['--infilux-runtime-channel=unknown'])).toBeNull();
  });

  it('resolves runtime channels with explicit overrides first', () => {
    expect(
      resolveAppRuntimeChannel({
        explicitChannel: 'prod',
        nodeEnv: 'test',
        vitest: 'true',
        isPackaged: false,
      })
    ).toBe('prod');
  });

  it('prefers test environments before packaged or dev detection', () => {
    expect(resolveAppRuntimeChannel({ nodeEnv: 'test', isPackaged: true })).toBe('test');
    expect(resolveAppRuntimeChannel({ vitest: 'true', isPackaged: false })).toBe('test');
  });

  it('builds distinct tmux and persistence identities per channel', () => {
    expect(buildAppRuntimeIdentity('prod')).toEqual({
      channel: 'prod',
      tmuxServerName: 'enso',
      persistentAgentHostSessionPrefix: 'enso',
      persistentAgentSessionDatabaseFilename: 'persistent-agent-sessions.db',
    });
    expect(buildAppRuntimeIdentity('dev')).toEqual({
      channel: 'dev',
      tmuxServerName: 'enso-dev',
      persistentAgentHostSessionPrefix: 'enso-dev',
      persistentAgentSessionDatabaseFilename: 'persistent-agent-sessions-dev.db',
    });
    expect(buildPersistentAgentHostSessionKey('ui:session/1', 'test')).toBe(
      'enso-test-ui_session_1'
    );
  });
});
