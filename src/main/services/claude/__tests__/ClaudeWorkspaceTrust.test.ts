import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureClaudeWorkspaceTrusted } from '../ClaudeWorkspaceTrust';

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('ensureClaudeWorkspaceTrusted', () => {
  it('marks both workspace and canonical paths as trusted Claude projects', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'claude-workspace-trust-'));
    const claudeJsonPath = join(rootDir, '.claude.json');
    writeFileSync(claudeJsonPath, JSON.stringify({ projects: {} }, null, 2), 'utf8');

    const result = ensureClaudeWorkspaceTrusted('/tmp/workspace-a', {
      claudeJsonPath,
      resolveRealpath: (workspacePath) =>
        workspacePath === '/tmp/workspace-a' ? '/private/tmp/workspace-a' : workspacePath,
    });

    expect(result).toBe(true);

    const data = readJson(claudeJsonPath);
    const projects = data.projects as Record<string, Record<string, unknown>>;

    expect(projects['/tmp/workspace-a']).toMatchObject({
      hasTrustDialogAccepted: true,
      allowedTools: [],
      mcpContextUris: [],
      enabledMcpjsonServers: [],
      disabledMcpjsonServers: [],
    });
    expect(projects['/private/tmp/workspace-a']).toMatchObject({
      hasTrustDialogAccepted: true,
    });
  });

  it('preserves existing Claude project settings while enabling trust', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'claude-workspace-trust-'));
    const claudeJsonPath = join(rootDir, '.claude.json');
    writeFileSync(
      claudeJsonPath,
      JSON.stringify(
        {
          projects: {
            '/repo': {
              hasTrustDialogAccepted: false,
              allowedTools: ['Read'],
              projectOnboardingSeenCount: 7,
              exampleFiles: ['keep.ts'],
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const result = ensureClaudeWorkspaceTrusted('/repo', {
      claudeJsonPath,
      resolveRealpath: (workspacePath) => workspacePath,
    });

    expect(result).toBe(true);

    const data = readJson(claudeJsonPath);
    const projects = data.projects as Record<string, Record<string, unknown>>;

    expect(projects['/repo']).toMatchObject({
      hasTrustDialogAccepted: true,
      allowedTools: ['Read'],
      projectOnboardingSeenCount: 7,
      exampleFiles: ['keep.ts'],
    });
  });
});
