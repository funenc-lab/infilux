import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RUNTIME_STATE_DIRNAME,
  SESSION_STATE_FILENAME,
  SETTINGS_FILENAME,
} from '../../src/shared/paths';
import {
  type AppRuntimeChannel,
  buildAppRuntimeIdentity,
  buildPersistentAgentHostSessionKey,
} from '../../src/shared/utils/runtimeIdentity';
import { sanitizeRuntimeProfileName } from '../../src/shared/utils/runtimeProfile';

export const AGENT_SESSION_RECOVERY_RUNTIME_CHANNEL: AppRuntimeChannel = 'dev';

interface CommandOptions {
  cwd?: string;
  allowFailure?: boolean;
}

export interface AgentSessionRecoveryScenario {
  homeDir: string;
  repoPath: string;
  repoName: string;
  worktreePath: string;
  worktreeBranch: string;
  uiSessionId: string;
  sessionDisplayName: string;
  sessionPanelId: string;
  transcriptFirstLine: string;
  transcriptLastLine: string;
  tmuxGreeting: string;
  tmuxSessionName: string;
  profileName: string;
  cleanup: () => Promise<void>;
}

const RECOVERY_TRANSCRIPT_LINE_COUNT = 180;
const RECOVERY_TRANSCRIPT_PREFIX = 'RECOVERY-LINE';

function normalizePathForRepositoryId(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return normalized.toLowerCase();
  }
  return normalized;
}

function buildLocalRepositoryId(repoPath: string): string {
  return `local:${normalizePathForRepositoryId(repoPath)}`;
}

function getScenarioRuntimeIdentity() {
  return buildAppRuntimeIdentity(AGENT_SESSION_RECOVERY_RUNTIME_CHANNEL);
}

function getTmuxSocketArgs(): string[] {
  return ['-L', getScenarioRuntimeIdentity().tmuxServerName, '-f', '/dev/null'];
}

function buildRecoveryRuntimeRoot(homeDir: string, profileName: string): string {
  const effectiveProfileName = sanitizeRuntimeProfileName(profileName) || 'dev';
  return join(homeDir, `${RUNTIME_STATE_DIRNAME}-dev`, effectiveProfileName);
}

function buildTmuxSessionName(uiSessionId: string): string {
  return buildPersistentAgentHostSessionKey(uiSessionId, AGENT_SESSION_RECOVERY_RUNTIME_CHANNEL);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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

  if (options.allowFailure) {
    return result.stdout.trim();
  }

  const details = [
    `Command failed: ${command} ${args.join(' ')}`,
    `exitCode=${String(result.status)}`,
    result.stdout ? `stdout:\n${result.stdout.trim()}` : '',
    result.stderr ? `stderr:\n${result.stderr.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  throw new Error(details);
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function ensureTmuxSessionMissing(sessionName: string): void {
  runCommand('tmux', [...getTmuxSocketArgs(), 'kill-session', '-t', sessionName], {
    allowFailure: true,
  });
}

function assertTmuxSessionExists(sessionName: string): void {
  runCommand('tmux', [...getTmuxSocketArgs(), 'has-session', '-t', sessionName]);
}

async function createGitRepositoryFixture(repoPath: string, worktreePath: string): Promise<void> {
  await mkdir(repoPath, { recursive: true });

  runCommand('git', ['init'], { cwd: repoPath });
  runCommand('git', ['checkout', '-b', 'main'], { cwd: repoPath });
  runCommand('git', ['config', 'user.name', 'Infilux E2E'], { cwd: repoPath });
  runCommand('git', ['config', 'user.email', 'e2e@infilux.dev'], { cwd: repoPath });

  await writeFile(join(repoPath, 'README.md'), '# Infilux E2E\n', 'utf8');
  runCommand('git', ['add', 'README.md'], { cwd: repoPath });
  runCommand('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath });
  runCommand('git', ['branch', 'feature-recovery'], { cwd: repoPath });
  runCommand('git', ['worktree', 'add', worktreePath, 'feature-recovery'], { cwd: repoPath });
}

async function createTmuxRecoverySession(options: {
  rootDir: string;
  worktreePath: string;
  sessionName: string;
  greeting: string;
}): Promise<void> {
  const scriptPath = join(options.rootDir, 'tmux-recovery-session.sh');
  const scriptContent = [
    '#!/bin/sh',
    `cd ${shellQuote(options.worktreePath)} || exit 1`,
    'i=1',
    `while [ "$i" -le ${RECOVERY_TRANSCRIPT_LINE_COUNT} ]; do`,
    `  printf '${RECOVERY_TRANSCRIPT_PREFIX}-%03d\\n' "$i"`,
    '  i=$((i + 1))',
    'done',
    `printf '%s\\n' ${shellQuote(options.greeting)}`,
    'exec cat',
    '',
  ].join('\n');

  await writeFile(scriptPath, scriptContent, 'utf8');
  await chmod(scriptPath, 0o755);

  ensureTmuxSessionMissing(options.sessionName);
  runCommand('tmux', [
    ...getTmuxSocketArgs(),
    'new-session',
    '-d',
    '-s',
    options.sessionName,
    scriptPath,
  ]);
  assertTmuxSessionExists(options.sessionName);
}

export function ensureTmuxAvailable(): void {
  const result = spawnSync('tmux', ['-V'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(
      [
        'tmux is required for the Electron recovery E2E test.',
        result.stderr?.trim() || result.stdout?.trim() || 'tmux -V failed.',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

export async function createAgentSessionRecoveryScenario(): Promise<AgentSessionRecoveryScenario> {
  const rootDir = await mkdtemp(join(tmpdir(), 'infilux-agent-recovery-'));
  const homeDir = join(rootDir, 'home');
  const workspaceRoot = join(rootDir, 'workspace');
  const repoPath = join(workspaceRoot, 'repo-main');
  const worktreePath = join(workspaceRoot, 'repo-feature-recovery');
  const repoName = 'repo-main';
  const worktreeBranch = 'feature-recovery';
  const uiSessionId = `ui-recovery-${randomUUID()}`;
  const profileName = sanitizeRuntimeProfileName(`e2e-${uiSessionId}`) || 'e2e';
  const tmuxSessionName = buildTmuxSessionName(uiSessionId);
  const sessionDisplayName = 'Recovered Session';
  const tmuxGreeting = 'Recovered from tmux';
  const runtimeRoot = buildRecoveryRuntimeRoot(homeDir, profileName);
  const settingsPath = join(runtimeRoot, SETTINGS_FILENAME);
  const sessionStatePath = join(runtimeRoot, SESSION_STATE_FILENAME);

  await mkdir(homeDir, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });

  await createGitRepositoryFixture(repoPath, worktreePath);
  await createTmuxRecoverySession({
    rootDir,
    worktreePath,
    sessionName: tmuxSessionName,
    greeting: tmuxGreeting,
  });

  const settingsDocument = {
    'enso-settings': {
      state: {
        claudeCodeIntegration: {
          tmuxEnabled: true,
        },
      },
    },
  };

  const localStorageSnapshot = {
    'enso-repositories': JSON.stringify([
      {
        id: buildLocalRepositoryId(repoPath),
        name: repoName,
        path: repoPath,
        kind: 'local',
      },
    ]),
    'enso-selected-repo': repoPath,
    'enso-tree-sidebar-expanded-repos': JSON.stringify([repoPath]),
  };

  const now = Date.now();
  const persistentRecord = {
    uiSessionId,
    backendSessionId: `stale-backend-${uiSessionId}`,
    agentId: 'shell',
    agentCommand: 'sh',
    environment: 'native',
    repoPath,
    cwd: worktreePath,
    displayName: sessionDisplayName,
    activated: true,
    initialized: true,
    hostKind: 'tmux',
    hostSessionKey: tmuxSessionName,
    recoveryPolicy: 'auto',
    createdAt: now - 1000,
    updatedAt: now,
    lastKnownState: 'live',
  };

  const sessionStateDocument = {
    version: 2,
    updatedAt: now,
    settingsData: settingsDocument,
    localStorage: localStorageSnapshot,
    persistentAgentSessions: [persistentRecord],
    todos: {},
  };

  await writeJsonFile(settingsPath, settingsDocument);
  await writeJsonFile(sessionStatePath, sessionStateDocument);

  return {
    homeDir,
    repoPath,
    repoName,
    worktreePath,
    worktreeBranch,
    uiSessionId,
    sessionDisplayName,
    sessionPanelId: `agent-session-panel-${uiSessionId}`,
    transcriptFirstLine: `${RECOVERY_TRANSCRIPT_PREFIX}-001`,
    transcriptLastLine: `${RECOVERY_TRANSCRIPT_PREFIX}-${String(RECOVERY_TRANSCRIPT_LINE_COUNT).padStart(3, '0')}`,
    tmuxGreeting,
    tmuxSessionName,
    profileName,
    cleanup: async () => {
      ensureTmuxSessionMissing(tmuxSessionName);
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}
