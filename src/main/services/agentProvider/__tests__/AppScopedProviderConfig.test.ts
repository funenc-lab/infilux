import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeAppScopedProviderConfig } from '../AppScopedProviderConfig';

const temporaryRoots: string[] = [];

function createTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'infilux-provider-scope-'));
  temporaryRoots.push(root);
  return root;
}

function writeTextFile(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
}

describe('AppScopedProviderConfig', () => {
  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('seeds an Infilux-owned provider scope from the existing user configuration', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');
    const env: NodeJS.ProcessEnv = {};

    writeTextFile(join(homeDir, '.codex', 'config.toml'), 'model = "global-model"\n');
    writeTextFile(join(homeDir, '.codex', 'auth.json'), '{"auth":"global"}\n');
    writeTextFile(join(homeDir, '.gemini', '.env'), 'GEMINI_MODEL="global-gemini"\n');
    writeTextFile(join(homeDir, '.gemini', 'settings.json'), '{"theme":"global"}\n');
    writeTextFile(join(homeDir, '.claude', 'settings.json'), '{"model":"global-claude"}\n');

    const paths = initializeAppScopedProviderConfig({ configRoot, env, homeDir });

    expect(paths).toEqual({
      claudeConfigDir: join(configRoot, 'claude'),
      codexHome: join(configRoot, 'codex'),
      geminiHome: join(configRoot, 'gemini'),
    });
    expect(env).toMatchObject({
      CLAUDE_CONFIG_DIR: join(configRoot, 'claude'),
      CODEX_HOME: join(configRoot, 'codex'),
      GEMINI_CLI_HOME: join(configRoot, 'gemini'),
    });
    expect(readFileSync(join(configRoot, 'codex', 'config.toml'), 'utf8')).toBe(
      'model = "global-model"\n'
    );
    expect(readFileSync(join(configRoot, 'codex', 'auth.json'), 'utf8')).toBe(
      '{"auth":"global"}\n'
    );
    expect(readFileSync(join(configRoot, 'gemini', '.env'), 'utf8')).toBe(
      'GEMINI_MODEL="global-gemini"\n'
    );
    expect(readFileSync(join(configRoot, 'gemini', 'settings.json'), 'utf8')).toBe(
      '{"theme":"global"}\n'
    );
    expect(readFileSync(join(configRoot, 'claude', 'settings.json'), 'utf8')).toBe(
      '{"model":"global-claude"}\n'
    );
  });

  it('does not re-import later changes from the global EnsoAI-compatible configuration', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');

    writeTextFile(join(homeDir, '.codex', 'config.toml'), 'model = "initial-global-model"\n');
    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    writeTextFile(join(homeDir, '.codex', 'config.toml'), 'model = "changed-by-ensoai"\n');
    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    expect(readFileSync(join(configRoot, 'codex', 'config.toml'), 'utf8')).toBe(
      'model = "initial-global-model"\n'
    );
  });

  it('preserves an explicit host-provided provider configuration directory', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');
    const customCodexHome = join(root, 'custom-codex-home');
    const env: NodeJS.ProcessEnv = { CODEX_HOME: customCodexHome };

    initializeAppScopedProviderConfig({ configRoot, env, homeDir });

    expect(env.CODEX_HOME).toBe(customCodexHome);
    expect(existsSync(join(configRoot, 'codex', 'config.toml'))).toBe(false);
  });
});
