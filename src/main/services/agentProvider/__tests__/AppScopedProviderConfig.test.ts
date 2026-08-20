import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
    writeTextFile(join(homeDir, '.codex', 'skills', 'new-skill', 'SKILL.md'), '# New Skill\n');
    writeTextFile(
      join(homeDir, '.codex', 'skills.disabled', 'disabled-skill', 'SKILL.md'),
      '# Disabled Skill\n'
    );
    writeTextFile(
      join(
        homeDir,
        '.codex',
        'plugins',
        'cache',
        'marketplace',
        'review-plugin',
        '1.0.0',
        'plugin.json'
      ),
      '{"name":"review-plugin"}\n'
    );
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
    expect(readlinkSync(join(configRoot, 'codex', 'skills'))).toBe(
      join(homeDir, '.codex', 'skills')
    );
    expect(readlinkSync(join(configRoot, 'codex', 'skills.disabled'))).toBe(
      join(homeDir, '.codex', 'skills.disabled')
    );
    expect(readlinkSync(join(configRoot, 'codex', 'plugins'))).toBe(
      join(homeDir, '.codex', 'plugins')
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

  it('excludes user MCP configuration from a newly seeded Codex provider scope', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');
    const userConfigPath = join(homeDir, '.codex', 'config.toml');

    writeTextFile(
      userConfigPath,
      [
        'model = "global-model"',
        'mcp_servers.inline.command = "npx"',
        '',
        '[mcp_servers.penpad]',
        'command = "node"',
        'args = ["penpad-mcp"]',
        '',
        '[marketplaces.review-marketplace]',
        'source = "https://example.com/review-marketplace.git"',
      ].join('\n')
    );

    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    const scopedConfig = readFileSync(join(configRoot, 'codex', 'config.toml'), 'utf8');
    expect(scopedConfig).toContain('model = "global-model"');
    expect(scopedConfig).toContain('[marketplaces.review-marketplace]');
    expect(scopedConfig).not.toContain('mcp_servers');
    expect(readFileSync(userConfigPath, 'utf8')).toContain('[mcp_servers.penpad]');
  });

  it('removes legacy MCP configuration from an existing Codex provider scope', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');
    const scopedConfigPath = join(configRoot, 'codex', 'config.toml');

    writeTextFile(
      join(homeDir, '.codex', 'config.toml'),
      [
        'model = "global-model"',
        '',
        '[plugins."review-plugin@review-marketplace"]',
        'enabled = true',
      ].join('\n')
    );
    writeTextFile(join(configRoot, 'codex', '.infilux-provider-scope-v1'), '1\n');
    writeTextFile(
      scopedConfigPath,
      [
        'model = "scoped-model"',
        'mcp_servers.inline.command = "npx"',
        '',
        '[mcp_servers.penpad]',
        'command = "node"',
        'args = ["penpad-mcp"]',
        '',
        '[plugins."review-plugin@review-marketplace"]',
        'enabled = true',
      ].join('\n')
    );

    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    const scopedConfig = readFileSync(scopedConfigPath, 'utf8');
    expect(scopedConfig).toContain('model = "scoped-model"');
    expect(scopedConfig).toContain('[plugins."review-plugin@review-marketplace"]');
    expect(scopedConfig).not.toContain('mcp_servers');
  });

  it('removes MCP table headers with trailing comments from a scoped Codex config', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');
    const scopedConfigPath = join(configRoot, 'codex', 'config.toml');

    writeTextFile(
      join(homeDir, '.codex', 'config.toml'),
      [
        'model = "global-model"',
        '',
        '[plugins."review-plugin@review-marketplace"]',
        'enabled = true',
      ].join('\n')
    );
    writeTextFile(join(configRoot, 'codex', '.infilux-provider-scope-v1'), '1\n');
    writeTextFile(
      scopedConfigPath,
      [
        'model = "scoped-model"',
        '',
        '[mcp_servers.penpad] # migrated legacy configuration',
        'command = "node"',
        'args = ["penpad-mcp"]',
        '',
        '[plugins."review-plugin@review-marketplace"]',
        'enabled = true',
      ].join('\n')
    );

    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    const scopedConfig = readFileSync(scopedConfigPath, 'utf8');
    expect(scopedConfig).toContain('model = "scoped-model"');
    expect(scopedConfig).toContain('[plugins."review-plugin@review-marketplace"]');
    expect(scopedConfig).not.toContain('mcp_servers');
    expect(scopedConfig).not.toContain('penpad-mcp');
  });

  it('removes complete multiline root MCP assignments from a scoped Codex config', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');
    const scopedConfigPath = join(configRoot, 'codex', 'config.toml');

    writeTextFile(
      join(homeDir, '.codex', 'config.toml'),
      [
        'model = "global-model"',
        '',
        '[plugins."review-plugin@review-marketplace"]',
        'enabled = true',
      ].join('\n')
    );
    writeTextFile(join(configRoot, 'codex', '.infilux-provider-scope-v1'), '1\n');
    writeTextFile(
      scopedConfigPath,
      [
        'model = "scoped-model"',
        'mcp_servers = {',
        '  penpad = { command = "node", args = ["penpad-mcp"] },',
        '  codegraph = { command = "codegraph" },',
        '}',
        'log_level = "info"',
        '',
        '[plugins."review-plugin@review-marketplace"]',
        'enabled = true',
      ].join('\n')
    );

    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    const scopedConfig = readFileSync(scopedConfigPath, 'utf8');
    expect(scopedConfig).toContain('model = "scoped-model"');
    expect(scopedConfig).toContain('log_level = "info"');
    expect(scopedConfig).toContain('[plugins."review-plugin@review-marketplace"]');
    expect(scopedConfig).not.toContain('mcp_servers');
    expect(scopedConfig).not.toContain('penpad-mcp');
    expect(scopedConfig).not.toContain('codegraph');
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

  it('links existing Codex session history into an already initialized provider scope', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');
    const env: NodeJS.ProcessEnv = {};

    writeTextFile(join(homeDir, '.codex', 'sessions', '.keep'), '');
    writeTextFile(join(configRoot, 'codex', '.infilux-provider-scope-v1'), '1\n');

    initializeAppScopedProviderConfig({ configRoot, env, homeDir });

    expect(env.CODEX_HOME).toBe(join(configRoot, 'codex'));
    expect(readlinkSync(join(configRoot, 'codex', 'sessions'))).toBe(
      join(homeDir, '.codex', 'sessions')
    );
  });

  it('links Codex skills into an already initialized provider scope', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');

    writeTextFile(join(homeDir, '.codex', 'skills', 'new-skill', 'SKILL.md'), '# New Skill\n');
    writeTextFile(join(configRoot, 'codex', '.infilux-provider-scope-v1'), '1\n');

    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    expect(readlinkSync(join(configRoot, 'codex', 'skills'))).toBe(
      join(homeDir, '.codex', 'skills')
    );
  });

  it('links Codex marketplace snapshots into the app-scoped configuration', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');
    const marketplacePath = join(homeDir, '.codex', '.tmp', 'marketplaces');

    writeTextFile(
      join(marketplacePath, 'review-marketplace', '.claude-plugin', 'marketplace.json'),
      '{"name":"review-marketplace"}\n'
    );

    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    expect(readlinkSync(join(configRoot, 'codex', '.tmp', 'marketplaces'))).toBe(marketplacePath);
  });

  it('replaces a stale app-scoped Codex marketplace snapshot with the global snapshot', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');
    const marketplacePath = join(homeDir, '.codex', '.tmp', 'marketplaces');

    writeTextFile(
      join(marketplacePath, 'review-marketplace', '.claude-plugin', 'marketplace.json'),
      '{"name":"review-marketplace"}\n'
    );
    writeTextFile(
      join(
        configRoot,
        'codex',
        '.tmp',
        'marketplaces',
        'stale-marketplace',
        '.claude-plugin',
        'marketplace.json'
      ),
      '{"name":"stale-marketplace"}\n'
    );
    writeTextFile(join(configRoot, 'codex', '.infilux-provider-scope-v1'), '1\n');

    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    expect(readlinkSync(join(configRoot, 'codex', '.tmp', 'marketplaces'))).toBe(marketplacePath);
  });

  it('synchronizes Codex plugin configuration without overwriting isolated provider settings', () => {
    const root = createTemporaryRoot();
    const homeDir = join(root, 'home');
    const configRoot = join(root, 'infilux-provider-config');

    writeTextFile(join(homeDir, '.codex', 'config.toml'), 'model = "initial-global-model"\n');
    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    writeTextFile(
      join(homeDir, '.codex', 'config.toml'),
      [
        'model = "changed-global-model"',
        '',
        '[marketplaces.review-marketplace]',
        'source = "https://example.com/review-marketplace.git"',
        '',
        '[plugins."review-plugin@review-marketplace"]',
        'enabled = true',
      ].join('\n')
    );

    initializeAppScopedProviderConfig({ configRoot, env: {}, homeDir });

    const scopedConfig = readFileSync(join(configRoot, 'codex', 'config.toml'), 'utf8');
    expect(scopedConfig).toContain('model = "initial-global-model"');
    expect(scopedConfig).toContain('[marketplaces.review-marketplace]');
    expect(scopedConfig).toContain('source = "https://example.com/review-marketplace.git"');
    expect(scopedConfig).toContain('[plugins."review-plugin@review-marketplace"]');
    expect(scopedConfig).toContain('enabled = true');
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
