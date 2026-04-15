import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { RUNTIME_STATE_DIRNAME, SETTINGS_FILENAME } from '../../src/shared/paths';
import { sanitizeRuntimeProfileName } from '../../src/shared/utils/runtimeProfile';
import { buildRepositoryId } from '../../src/shared/utils/workspace';

interface CommandOptions {
  cwd?: string;
}

export interface CapabilityPolicyScenario {
  homeDir: string;
  profileName: string;
  repoPath: string;
  repoName: string;
  repoId: string;
  worktreePath: string;
  worktreeBranch: string;
  browserLocalStorage: Record<string, string>;
  codexLogPath: string;
  fakeBinDir: string;
  fakeCodexPath: string;
  duplicateSkillId: string;
  projectOnlySkillId: string;
  worktreeOnlySkillId: string;
  userDuplicateSkillPath: string;
  projectDuplicateSkillPath: string;
  projectOnlySkillPath: string;
  worktreeOnlySkillPath: string;
  projectSharedMcpId: string;
  worktreeSharedMcpId: string;
  userPersonalMcpId: string;
  projectPersonalMcpId: string;
  worktreePersonalMcpId: string;
  cleanup: () => Promise<void>;
}

interface LoggedCodexInvocation {
  argv: string[];
  cwd: string;
  pid: number;
  timestamp: string;
}

function runCommand(command: string, args: string[], options: CommandOptions = {}): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status === 0) {
    return result.stdout.trim();
  }

  throw new Error(
    [
      `Command failed: ${command} ${args.join(' ')}`,
      `exitCode=${String(result.status)}`,
      result.stdout ? `stdout:\n${result.stdout.trim()}` : '',
      result.stderr ? `stderr:\n${result.stderr.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

function normalizeStoragePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return normalized.toLowerCase();
  }
  return normalized;
}

async function writeTextFile(targetPath: string, content: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, 'utf8');
}

async function createGitRepositoryFixture(repoPath: string, worktreePath: string): Promise<void> {
  await mkdir(repoPath, { recursive: true });

  runCommand('git', ['init'], { cwd: repoPath });
  runCommand('git', ['checkout', '-b', 'main'], { cwd: repoPath });
  runCommand('git', ['config', 'user.name', 'Infilux E2E'], { cwd: repoPath });
  runCommand('git', ['config', 'user.email', 'e2e@infilux.dev'], { cwd: repoPath });

  await writeFile(join(repoPath, 'README.md'), '# Infilux Capability Policy E2E\n', 'utf8');
  runCommand('git', ['add', 'README.md'], { cwd: repoPath });
  runCommand('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath });
  runCommand('git', ['branch', 'feature-capability-policy'], { cwd: repoPath });
  runCommand('git', ['worktree', 'add', worktreePath, 'feature-capability-policy'], {
    cwd: repoPath,
  });
}

async function installFakeCodex(rootDir: string): Promise<{
  fakeBinDir: string;
  fakeCodexPath: string;
  codexLogPath: string;
}> {
  const fakeBinDir = join(rootDir, 'fake-bin');
  const codexPath = join(fakeBinDir, 'codex');
  const codexLogPath = join(rootDir, 'fake-codex.log');

  await mkdir(fakeBinDir, { recursive: true });
  await writeFile(codexLogPath, '', 'utf8');

  const script = [
    `#!${process.execPath}`,
    "const fs = require('node:fs')",
    '',
    'const logPath = process.env.CAPABILITY_TEST_CODEX_LOG',
    'const invocation = {',
    '  argv: process.argv.slice(2),',
    '  cwd: process.cwd(),',
    '  pid: process.pid,',
    '  timestamp: new Date().toISOString(),',
    '}',
    '',
    'if (logPath) {',
    "  fs.appendFileSync(logPath, JSON.stringify(invocation) + '\\n', 'utf8')",
    '}',
    '',
    "if (process.argv.includes('--version')) {",
    "  process.stdout.write('codex 0.99.0\\n')",
    '  process.exit(0)',
    '}',
    '',
    "process.stdout.write('Fake Codex ready\\n')",
    'process.stdin.resume()',
    "process.stdin.on('data', (chunk) => {",
    '  process.stdout.write(chunk)',
    '})',
    '',
  ].join('\n');

  await writeFile(codexPath, script, 'utf8');
  await chmod(codexPath, 0o755);

  return {
    fakeBinDir,
    fakeCodexPath: codexPath,
    codexLogPath,
  };
}

async function writeSettingsDocument(
  homeDir: string,
  profileName: string,
  codexPath: string
): Promise<void> {
  const effectiveProfileName = sanitizeRuntimeProfileName(profileName) || 'dev';
  const settingsRoot = join(homeDir, `${RUNTIME_STATE_DIRNAME}-dev`, effectiveProfileName);
  const settingsPath = join(settingsRoot, SETTINGS_FILENAME);

  await mkdir(settingsRoot, { recursive: true });
  await writeFile(
    settingsPath,
    `${JSON.stringify(
      {
        'enso-settings': {
          state: {
            agentSettings: {
              claude: { enabled: true, isDefault: true },
              codex: { enabled: true, isDefault: false, customPath: codexPath },
              droid: { enabled: false, isDefault: false },
              gemini: { enabled: false, isDefault: false },
              auggie: { enabled: false, isDefault: false },
              cursor: { enabled: false, isDefault: false },
              opencode: { enabled: false, isDefault: false },
            },
            agentDetectionStatus: {
              codex: { installed: true, version: '0.99.0' },
            },
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

async function installCapabilityFixtures(scenario: {
  homeDir: string;
  repoPath: string;
  worktreePath: string;
}): Promise<
  Pick<
    CapabilityPolicyScenario,
    | 'duplicateSkillId'
    | 'projectOnlySkillId'
    | 'worktreeOnlySkillId'
    | 'userDuplicateSkillPath'
    | 'projectDuplicateSkillPath'
    | 'projectOnlySkillPath'
    | 'worktreeOnlySkillPath'
    | 'projectSharedMcpId'
    | 'worktreeSharedMcpId'
    | 'userPersonalMcpId'
    | 'projectPersonalMcpId'
    | 'worktreePersonalMcpId'
  >
> {
  const duplicateSkillId = 'legacy-skill:duplicate-skill';
  const projectOnlySkillId = 'legacy-skill:project-only-skill';
  const worktreeOnlySkillId = 'legacy-skill:worktree-only-skill';

  const userDuplicateSkillPath = join(
    scenario.homeDir,
    '.codex',
    'skills',
    'duplicate-skill',
    'SKILL.md'
  );
  const projectDuplicateSkillPath = join(
    scenario.repoPath,
    '.agents',
    'skills',
    'duplicate-skill',
    'SKILL.md'
  );
  const projectOnlySkillPath = join(
    scenario.repoPath,
    '.codex',
    'skills',
    'project-only-skill',
    'SKILL.md'
  );
  const worktreeOnlySkillPath = join(
    scenario.worktreePath,
    '.codex',
    'skills',
    'worktree-only-skill',
    'SKILL.md'
  );

  await writeTextFile(
    userDuplicateSkillPath,
    ['---', 'name: Duplicate Skill', 'description: User duplicate skill', '---', ''].join('\n')
  );
  await writeTextFile(
    projectDuplicateSkillPath,
    ['---', 'name: Duplicate Skill', 'description: Project duplicate skill', '---', ''].join('\n')
  );
  await writeTextFile(
    projectOnlySkillPath,
    ['---', 'name: Project Only Skill', 'description: Project only skill', '---', ''].join('\n')
  );
  await writeTextFile(
    worktreeOnlySkillPath,
    ['---', 'name: Worktree Only Skill', 'description: Worktree only skill', '---', ''].join('\n')
  );

  const projectSharedMcpId = 'shared-project-e2e';
  const worktreeSharedMcpId = 'shared-worktree-e2e';
  const userPersonalMcpId = 'personal-user-e2e';
  const projectPersonalMcpId = 'personal-project-e2e';
  const worktreePersonalMcpId = 'personal-worktree-e2e';

  await writeTextFile(
    join(scenario.repoPath, '.mcp.json'),
    `${JSON.stringify(
      {
        mcpServers: {
          [projectSharedMcpId]: { command: 'npx', args: ['shared-project-e2e'] },
        },
      },
      null,
      2
    )}\n`
  );
  await writeTextFile(
    join(scenario.worktreePath, '.mcp.json'),
    `${JSON.stringify(
      {
        mcpServers: {
          [worktreeSharedMcpId]: { command: 'npx', args: ['shared-worktree-e2e'] },
        },
      },
      null,
      2
    )}\n`
  );

  await writeTextFile(
    join(scenario.homeDir, '.codex', 'config.toml'),
    [
      `[mcp_servers.${userPersonalMcpId}]`,
      'command = "uvx"',
      `args = ["${userPersonalMcpId}"]`,
    ].join('\n')
  );
  await writeTextFile(
    join(scenario.repoPath, '.codex', 'config.toml'),
    [
      `[mcp_servers.${projectPersonalMcpId}]`,
      'command = "uvx"',
      `args = ["${projectPersonalMcpId}"]`,
    ].join('\n')
  );
  await writeTextFile(
    join(scenario.worktreePath, '.codex', 'config.toml'),
    [
      `[mcp_servers.${worktreePersonalMcpId}]`,
      'command = "uvx"',
      `args = ["${worktreePersonalMcpId}"]`,
    ].join('\n')
  );

  return {
    duplicateSkillId,
    projectOnlySkillId,
    worktreeOnlySkillId,
    userDuplicateSkillPath,
    projectDuplicateSkillPath,
    projectOnlySkillPath,
    worktreeOnlySkillPath,
    projectSharedMcpId,
    worktreeSharedMcpId,
    userPersonalMcpId,
    projectPersonalMcpId,
    worktreePersonalMcpId,
  };
}

function buildBrowserLocalStorageSnapshot(input: {
  repoId: string;
  repoName: string;
  repoPath: string;
}): Record<string, string> {
  return {
    'enso-repositories': JSON.stringify([
      {
        id: input.repoId,
        name: input.repoName,
        path: input.repoPath,
        kind: 'local',
      },
    ]),
    'enso-selected-repo': input.repoPath,
    'enso-tree-sidebar-expanded-repos': JSON.stringify([input.repoPath]),
  };
}

export async function createCapabilityPolicyScenario(): Promise<CapabilityPolicyScenario> {
  const rootDir = await mkdtemp(join(tmpdir(), 'infilux-capability-policy-'));
  const homeDir = join(rootDir, 'home');
  const workspaceRoot = join(rootDir, 'workspace');
  const repoPath = join(workspaceRoot, 'repo-main');
  const worktreePath = join(workspaceRoot, 'repo-feature-capability-policy');
  const repoName = 'repo-main';
  const worktreeBranch = 'feature-capability-policy';
  const repoId = buildRepositoryId('local', normalizeStoragePath(repoPath), {
    platform:
      process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux',
  });
  const profileName = `e2e-capability-${randomUUID()}`;

  await mkdir(homeDir, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await createGitRepositoryFixture(repoPath, worktreePath);

  const fakeCodex = await installFakeCodex(rootDir);
  await writeSettingsDocument(homeDir, profileName, fakeCodex.fakeCodexPath);
  const fixtures = await installCapabilityFixtures({
    homeDir,
    repoPath,
    worktreePath,
  });

  return {
    homeDir,
    profileName,
    repoPath,
    repoName,
    repoId,
    worktreePath,
    worktreeBranch,
    browserLocalStorage: buildBrowserLocalStorageSnapshot({
      repoId,
      repoName,
      repoPath,
    }),
    codexLogPath: fakeCodex.codexLogPath,
    fakeBinDir: fakeCodex.fakeBinDir,
    fakeCodexPath: fakeCodex.fakeCodexPath,
    ...fixtures,
    cleanup: async () => {
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}

export async function readLoggedCodexInvocations(
  logPath: string
): Promise<LoggedCodexInvocation[]> {
  try {
    const content = await readFile(logPath, 'utf8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LoggedCodexInvocation);
  } catch {
    return [];
  }
}
