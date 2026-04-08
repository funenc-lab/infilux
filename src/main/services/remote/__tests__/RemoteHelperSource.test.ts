import { buildAppRuntimeIdentity } from '@shared/utils/runtimeIdentity';
import { describe, expect, it } from 'vitest';
import { getRemoteServerSource } from '../RemoteHelperSource';

describe('getRemoteServerSource', () => {
  it('uses the Infilux runtime namespace for remote helper artifacts and tmux defaults', () => {
    const runtimeIdentity = buildAppRuntimeIdentity('test');
    const source = getRemoteServerSource(runtimeIdentity);

    expect(source).toContain('const DAEMON_INFO_FILE = "infilux-remote-daemon.json";');
    expect(source).toContain(
      'const RUNTIME_MANIFEST_FILENAME = "infilux-remote-runtime-manifest.json";'
    );
    expect(source).toContain(
      `const DEFAULT_TMUX_SERVER_NAME = "${runtimeIdentity.tmuxServerName}";`
    );
    expect(source).toContain(`tmux -L ${runtimeIdentity.tmuxServerName} kill-session -t `);
    expect(source).toContain(
      `serverName.length > 0 ? serverName : '${runtimeIdentity.tmuxServerName}';`
    );
    expect(source).not.toContain('const DAEMON_INFO_FILE = "enso-remote-daemon.json";');
    expect(source).not.toContain(
      'const RUNTIME_MANIFEST_FILENAME = "enso-remote-runtime-manifest.json";'
    );
    expect(source).not.toContain('tmux -L enso kill-session -t ');
    expect(source).not.toContain("serverName.length > 0 ? serverName : 'enso';");
  });
});
