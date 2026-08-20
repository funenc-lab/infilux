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

export interface CodexWorktreeHistoryScenario {
  browserLocalStorage: Record<string, string>;
  homeDir: string;
  legacySessionId: string;
  profileName: string;
  repoId: string;
  repoName: string;
  repoPath: string;
  siblingSessionId: string;
  worktreeBranch: string;
  worktreePath: string;
  invocationLogPath: string;
  cleanup: () => Promise<void>;
}

export type FakeCodexInvocation =
  | {
      codexHome: string | null;
      cwd: string;
      type: 'start';
    }
  | {
      codexHome: string | null;
      cwd: string;
      sessionIds: string[];
      type: 'resume';
    };

function resolveWorkspacePlatform(): 'darwin' | 'linux' | 'win32' {
  if (process.platform === 'darwin') {
    return 'darwin';
  }
  if (process.platform === 'win32') {
    return 'win32';
  }
  return 'linux';
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
  await writeFile(join(repoPath, 'README.md'), '# Infilux Codex History E2E\n', 'utf8');
  runCommand('git', ['add', 'README.md'], { cwd: repoPath });
  runCommand('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath });
  runCommand('git', ['branch', 'feature-codex-history'], { cwd: repoPath });
  runCommand('git', ['worktree', 'add', worktreePath, 'feature-codex-history'], {
    cwd: repoPath,
  });
}

async function writeLegacySession(options: {
  cwd: string;
  rootPath: string;
  threadId: string;
}): Promise<void> {
  const targetPath = join(
    options.rootPath,
    '2026',
    '08',
    '20',
    `rollout-${options.threadId}.jsonl`
  );
  await writeTextFile(
    targetPath,
    `${JSON.stringify({
      type: 'session_meta',
      payload: { id: options.threadId, cwd: options.cwd },
    })}\n`
  );
}

async function installFakeCodex(rootPath: string): Promise<string> {
  const fakeCodexPath = join(rootPath, 'fake-bin', 'codex');
  const script = [
    `#!${process.execPath}`,
    "const fs = require('node:fs')",
    '',
    'const logPath = process.env.CODEX_HISTORY_E2E_LOG',
    'const writeEvent = (event) => {',
    '  if (!logPath) return',
    "  fs.appendFileSync(logPath, JSON.stringify(event) + '\\n', 'utf8')",
    '}',
    '',
    'const readSessionIds = (sessionsPath) => {',
    '  if (!sessionsPath || !fs.existsSync(sessionsPath)) return []',
    '  const ids = []',
    '  const directories = [sessionsPath]',
    '  while (directories.length > 0) {',
    '    const directory = directories.pop()',
    '    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {',
    "      const entryPath = require('node:path').join(directory, entry.name)",
    '      if (entry.isDirectory()) {',
    '        directories.push(entryPath)',
    "      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {",
    "        for (const line of fs.readFileSync(entryPath, 'utf8').split('\\n')) {",
    '          try {',
    '            const record = JSON.parse(line)',
    "            if (record.type === 'session_meta' && typeof record.payload?.id === 'string') {",
    '              ids.push(record.payload.id)',
    '              break',
    '            }',
    '          } catch {}',
    '        }',
    '      }',
    '    }',
    '  }',
    '  return [...new Set(ids)].sort()',
    '}',
    '',
    "if (process.argv.includes('--version')) {",
    "  process.stdout.write('codex 0.99.0\\n')",
    '  process.exit(0)',
    '}',
    '',
    "writeEvent({ type: 'start', cwd: process.cwd(), codexHome: process.env.CODEX_HOME || null })",
    "process.stdout.write('Fake Codex ready\\n')",
    "let inputBuffer = ''",
    "process.stdin.on('data', (chunk) => {",
    "  inputBuffer += chunk.toString('utf8')",
    '  process.stdout.write(chunk)',
    "  let newlineIndex = inputBuffer.indexOf('\\n')",
    '  while (newlineIndex >= 0) {',
    '    const command = inputBuffer.slice(0, newlineIndex).trim()',
    '    inputBuffer = inputBuffer.slice(newlineIndex + 1)',
    "    if (command === '/resume') {",
    '      const codexHome = process.env.CODEX_HOME || null',
    "      const sessionIds = readSessionIds(codexHome ? require('node:path').join(codexHome, 'sessions') : null)",
    "      writeEvent({ type: 'resume', cwd: process.cwd(), codexHome, sessionIds })",
    `      process.stdout.write(\`\\r\\nRESUME_SESSIONS:\${sessionIds.join(',')}\\r\\n\`)`,
    '    }',
    "    newlineIndex = inputBuffer.indexOf('\\n')",
    '  }',
    '})',
    '',
  ].join('\n');

  await writeTextFile(fakeCodexPath, script);
  await chmod(fakeCodexPath, 0o755);
  return fakeCodexPath;
}

async function writeSettingsDocument(
  homeDir: string,
  profileName: string,
  fakeCodexPath: string
): Promise<void> {
  const effectiveProfileName = sanitizeRuntimeProfileName(profileName) || 'e2e';
  const runtimeRoot = join(homeDir, `${RUNTIME_STATE_DIRNAME}-dev`, effectiveProfileName);
  await writeTextFile(
    join(runtimeRoot, SETTINGS_FILENAME),
    `${JSON.stringify(
      {
        'enso-settings': {
          state: {
            agentSettings: {
              claude: { enabled: true, isDefault: true },
              codex: { enabled: true, isDefault: false, customPath: fakeCodexPath },
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
    )}\n`
  );
}

function buildBrowserLocalStorageSnapshot(input: {
  repoId: string;
  repoName: string;
  repoPath: string;
  worktreePath: string;
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
    'enso-active-worktrees': JSON.stringify({
      [input.repoPath]: input.worktreePath,
    }),
    'enso-worktree-tabs': JSON.stringify({
      [input.worktreePath]: 'chat',
    }),
  };
}

export async function createCodexWorktreeHistoryScenario(): Promise<CodexWorktreeHistoryScenario> {
  const rootPath = await mkdtemp(join(tmpdir(), 'infilux-codex-worktree-history-'));
  const homeDir = join(rootPath, 'home');
  const workspaceRoot = join(rootPath, 'workspace');
  const repoPath = join(workspaceRoot, 'repo-main');
  const worktreePath = join(workspaceRoot, 'repo-feature-codex-history');
  const repoName = 'repo-main';
  const worktreeBranch = 'feature-codex-history';
  const profileName = `e2e-codex-history-${randomUUID()}`;
  const legacySessionId = 'legacy-worktree-session';
  const siblingSessionId = 'legacy-sibling-session';
  const invocationLogPath = join(rootPath, 'fake-codex.log');
  const repoId = buildRepositoryId('local', repoPath, { platform: resolveWorkspacePlatform() });

  await mkdir(homeDir, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await createGitRepositoryFixture(repoPath, worktreePath);
  const fakeCodexPath = await installFakeCodex(rootPath);
  await writeSettingsDocument(homeDir, profileName, fakeCodexPath);
  await writeTextFile(join(homeDir, '.codex', 'config.toml'), 'model = "gpt-5"\n');
  await writeLegacySession({
    rootPath: join(homeDir, '.codex', 'sessions'),
    threadId: legacySessionId,
    cwd: worktreePath,
  });
  await writeLegacySession({
    rootPath: join(homeDir, '.codex', 'sessions'),
    threadId: siblingSessionId,
    cwd: join(workspaceRoot, 'repo-sibling-worktree'),
  });
  await writeFile(invocationLogPath, '', 'utf8');

  return {
    browserLocalStorage: buildBrowserLocalStorageSnapshot({
      repoId,
      repoName,
      repoPath,
      worktreePath,
    }),
    homeDir,
    legacySessionId,
    profileName,
    repoId,
    repoName,
    repoPath,
    siblingSessionId,
    worktreeBranch,
    worktreePath,
    invocationLogPath,
    cleanup: async () => {
      await rm(rootPath, { recursive: true, force: true });
    },
  };
}

export async function readFakeCodexInvocations(logPath: string): Promise<FakeCodexInvocation[]> {
  try {
    const content = await readFile(logPath, 'utf8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FakeCodexInvocation);
  } catch {
    return [];
  }
}
