import { buildAppRuntimeIdentity } from '@shared/utils/runtimeIdentity';
import { describe, expect, it } from 'vitest';
import pkg from '../../../../../package.json';
import { getRemoteServerSource, REMOTE_SERVER_VERSION } from '../RemoteHelperSource';

describe('getRemoteServerSource', () => {
  it('keeps the remote server version aligned with the app release version', () => {
    expect(REMOTE_SERVER_VERSION).toBe(pkg.version);
    expect(getRemoteServerSource()).toContain(
      `const REMOTE_SERVER_VERSION = ${JSON.stringify(pkg.version)};`
    );
  });

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
    expect(source).toContain(
      `typeof serverName === 'string' && serverName.length > 0 ? serverName : '${runtimeIdentity.tmuxServerName}';`
    );
    expect(source).toContain(
      "'tmux -L ' + shellQuote(normalizedServerName) + ' kill-session -t ' + shellQuote(name)"
    );
    expect(source).not.toContain('const DAEMON_INFO_FILE = "enso-remote-daemon.json";');
    expect(source).not.toContain(
      'const RUNTIME_MANIFEST_FILENAME = "enso-remote-runtime-manifest.json";'
    );
    expect(source).not.toContain("'tmux -L enso kill-session -t ' + shellQuote(name)");
    expect(source).not.toContain(
      "typeof serverName === 'string' && serverName.length > 0 ? serverName : 'enso';"
    );
  });

  it('keeps remote tmux scroll behavior aligned with the cached local pane resolution flow', () => {
    const source = getRemoteServerSource(buildAppRuntimeIdentity('test'));

    expect(source).toContain('const TMUX_SCROLL_PANE_CACHE_TTL_MS = 250;');
    expect(source).toContain('const tmuxScrollPaneCache = new Map();');
    expect(source).toContain('function buildTmuxScrollPaneCacheKey(serverName, sessionName) {');
    expect(source).toContain('function getCachedTmuxScrollPane(serverName, sessionName) {');
    expect(source).toContain('function setCachedTmuxScrollPane(serverName, sessionName, pane) {');
    expect(source).toContain('function clearCachedTmuxScrollPane(serverName, sessionName) {');
    expect(source).toContain(
      'async function resolveTmuxScrollPane(sessionName, serverName, options = {}) {'
    );
    expect(source).toContain('const cached = getCachedTmuxScrollPane(serverName, sessionName);');
    expect(source).toContain("if (direction === 'bottom') {");
    expect(source).toContain(
      'setCachedTmuxScrollPane(normalizedServerName, normalizedSessionName, {'
    );
    expect(source).toContain(
      'clearCachedTmuxScrollPane(normalizedServerName, normalizedSessionName);'
    );
  });

  it('keeps remote search behavior aligned with the shared search contract', () => {
    const source = getRemoteServerSource(buildAppRuntimeIdentity('test'));

    expect(source).toContain(
      'async function searchFiles(rootPath, query, maxResults = 100, includeDirectories = false, useGitignore = true, requestId)'
    );
    expect(source).toContain('activeSearches: new Map()');
    expect(source).toContain('registerActiveSearch(requestId, child)');
    expect(source).toContain('function fuzzyMatch(query, target)');
    expect(source).toContain(
      'return Math.max(fuzzyMatch(query, name), fuzzyMatch(query, relativePath) * 0.8);'
    );
    expect(source).toContain("if (useGitignore) args.push('--exclude-standard');");
    expect(source).toContain("if (!useGitignore) args.push('--no-ignore');");
    expect(source).toContain(
      "const args = ['-n', '--column', '-I', '--hidden', '-m', String(maxResults)];"
    );
    expect(source).toContain('allowedExitCodes: [0, 1, 2]');
    expect(source).toContain(
      "error: code === 2 && matches.length === 0 ? 'Invalid search expression' : undefined"
    );
    expect(source).toContain('const limitedMatches = matches.slice(0, maxResults);');
    expect(source).toContain('truncated: matches.length > limitedMatches.length');
    expect(source).toContain(
      "'search:files': ({ rootPath, query, maxResults, includeDirectories, useGitignore, requestId }) =>"
    );
    expect(source).toContain("'search:cancel': ({ requestId }) => cancelSearch(requestId)");
  });
});
