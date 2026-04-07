import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRepositoryId } from '../../src/shared/utils/workspace';

const DEFAULT_PROBE_TIMEOUT_MS = 30000;
const PROBE_POLL_INTERVAL_MS = 100;

interface CommandOptions {
  cwd?: string;
}

interface AgentSessionsSnapshot {
  sessions: Array<{
    id: string;
    sessionId: string;
    createdAt: number;
    name: string;
    agentId: string;
    agentCommand: string;
    customArgs?: string;
    initialized: boolean;
    activated: boolean;
    repoPath: string;
    cwd: string;
    environment: 'native';
    persistenceEnabled: boolean;
  }>;
  activeIds: Record<string, string | null>;
  groupStates: Record<
    string,
    {
      groups: Array<{
        id: string;
        sessionIds: string[];
        activeSessionId: string | null;
      }>;
      activeGroupId: string | null;
      flexPercents: number[];
    }
  >;
  runtimeStates: Record<string, never>;
  enhancedInputStates: Record<string, never>;
}

export interface AgentWheelProbeScenario {
  homeDir: string;
  profileName: string;
  repoPath: string;
  repoName: string;
  repoId: string;
  worktreePath: string;
  worktreeBranch: string;
  uiSessionId: string;
  sessionDisplayName: string;
  sessionPanelId: string;
  probeScriptPath: string;
  probeLogPath: string;
  browserLocalStorage: Record<string, string>;
  cleanup: () => Promise<void>;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeStoragePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return normalized.toLowerCase();
  }
  return normalized;
}

function resolveWorkspacePlatform(): 'linux' | 'darwin' | 'win32' {
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

async function createGitRepositoryFixture(repoPath: string, worktreePath: string): Promise<void> {
  await mkdir(repoPath, { recursive: true });

  runCommand('git', ['init'], { cwd: repoPath });
  runCommand('git', ['checkout', '-b', 'main'], { cwd: repoPath });
  runCommand('git', ['config', 'user.name', 'Infilux E2E'], { cwd: repoPath });
  runCommand('git', ['config', 'user.email', 'e2e@infilux.dev'], { cwd: repoPath });

  await writeFile(join(repoPath, 'README.md'), '# Infilux E2E\n', 'utf8');
  runCommand('git', ['add', 'README.md'], { cwd: repoPath });
  runCommand('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath });
  runCommand('git', ['branch', 'feature-wheel-scroll'], { cwd: repoPath });
  runCommand('git', ['worktree', 'add', worktreePath, 'feature-wheel-scroll'], { cwd: repoPath });
}

async function installWheelProbeScript(rootDir: string): Promise<{
  probeScriptPath: string;
  probeLogPath: string;
}> {
  const probeScriptPath = join(rootDir, 'agent-wheel-probe.py');
  const probeLogPath = join(rootDir, 'agent-wheel-probe.log');

  const probeScript = [
    'import atexit',
    'import os',
    'import sys',
    'import termios',
    'import tty',
    '',
    'LOG_PATH = sys.argv[1]',
    "READY_MARKER = 'READY'",
    'TRANSCRIPT_LINE_COUNT = 180',
    'fd = sys.stdin.fileno()',
    'original = termios.tcgetattr(fd)',
    "text_buffer = ''",
    '',
    'def log_marker(label):',
    "    with open(LOG_PATH, 'a', encoding='utf-8') as log:",
    "        log.write(f'{label}\\n')",
    '        log.flush()',
    '',
    'def flush_text_buffer():',
    '    global text_buffer',
    '    if not text_buffer:',
    '        return',
    "    log_marker(f'TEXT:{text_buffer}')",
    "    text_buffer = ''",
    '',
    'def cleanup():',
    '    flush_text_buffer()',
    '    try:',
    '        termios.tcsetattr(fd, termios.TCSADRAIN, original)',
    '    except Exception:',
    '        pass',
    '    try:',
    "        sys.stdout.write('\\x1b[?1000l\\x1b[?1006l')",
    "        sys.stdout.write('\\x1b[?1049l')",
    '        sys.stdout.flush()',
    '    except Exception:',
    '        pass',
    '',
    'atexit.register(cleanup)',
    '',
    'tty.setraw(fd)',
    "sys.stdout.write('\\x1b[?1049h\\x1b[?1000h\\x1b[?1006h')",
    'for index in range(1, TRANSCRIPT_LINE_COUNT + 1):',
    "    sys.stdout.write(f'TRANSCRIPT-LINE-{index:03d}\\r\\n')",
    "sys.stdout.write('Wheel probe ready\\r\\n')",
    'sys.stdout.flush()',
    '',
    "sequences = [(b'\\x1b[5~', 'PAGE_UP'), (b'\\x1b[6~', 'PAGE_DOWN'), (b'\\x1b[A', 'ARROW_UP'), (b'\\x1b[B', 'ARROW_DOWN')]",
    '',
    'log_marker(READY_MARKER)',
    "buffer = b''",
    'while True:',
    '    chunk = os.read(fd, 32)',
    '    if not chunk:',
    '        break',
    '    buffer += chunk',
    '    while buffer:',
    "        if buffer.startswith(b'\\x1b[<'):",
    "            mouse_end_upper = buffer.find(b'M', 3)",
    "            mouse_end_lower = buffer.find(b'm', 3)",
    '            mouse_end_candidates = [value for value in (mouse_end_upper, mouse_end_lower) if value != -1]',
    '            if not mouse_end_candidates:',
    '                break',
    "            log_marker('MOUSE_EVENT')",
    '            buffer = buffer[min(mouse_end_candidates) + 1:]',
    '            continue',
    '',
    '        matched_sequence = False',
    '        for sequence, label in sequences:',
    '            if buffer.startswith(sequence):',
    '                log_marker(label)',
    '                buffer = buffer[len(sequence):]',
    '                matched_sequence = True',
    '                break',
    '        if matched_sequence:',
    '            continue',
    '',
    '        if buffer[0] == 0x1b:',
    '            if len(buffer) == 1:',
    '                break',
    '            buffer = buffer[1:]',
    '            continue',
    '',
    '        byte = buffer[0]',
    '        buffer = buffer[1:]',
    '        if byte in (10, 13):',
    '            flush_text_buffer()',
    '            continue',
    '        if 32 <= byte <= 126:',
    '            text_buffer += chr(byte)',
    '',
  ].join('\n');

  await writeFile(probeScriptPath, probeScript, { encoding: 'utf8', mode: 0o755 });
  await writeFile(probeLogPath, '', 'utf8');

  return {
    probeScriptPath,
    probeLogPath,
  };
}

function buildBrowserLocalStorageSnapshot(input: {
  repoId: string;
  repoName: string;
  repoPath: string;
  worktreePath: string;
  uiSessionId: string;
  sessionDisplayName: string;
  probeScriptPath: string;
  probeLogPath: string;
}): Record<string, string> {
  const normalizedWorktreePath = normalizeStoragePath(input.worktreePath);
  const groupId = randomUUID();
  const createdAt = Date.now();
  const agentSessionsSnapshot: AgentSessionsSnapshot = {
    sessions: [
      {
        id: input.uiSessionId,
        sessionId: input.uiSessionId,
        createdAt,
        name: input.sessionDisplayName,
        agentId: 'shell',
        agentCommand: 'python3',
        customArgs: `-u ${shellQuote(input.probeScriptPath)} ${shellQuote(input.probeLogPath)}`,
        initialized: true,
        activated: true,
        repoPath: input.repoPath,
        cwd: input.worktreePath,
        environment: 'native',
        persistenceEnabled: true,
      },
    ],
    activeIds: {
      [normalizedWorktreePath]: input.uiSessionId,
    },
    groupStates: {
      [normalizedWorktreePath]: {
        groups: [
          {
            id: groupId,
            sessionIds: [input.uiSessionId],
            activeSessionId: input.uiSessionId,
          },
        ],
        activeGroupId: groupId,
        flexPercents: [100],
      },
    },
    runtimeStates: {},
    enhancedInputStates: {},
  };

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
    'enso-agent-sessions': JSON.stringify(agentSessionsSnapshot),
  };
}

export async function createAgentWheelProbeScenario(): Promise<AgentWheelProbeScenario> {
  const rootDir = await mkdtemp(join(tmpdir(), 'infilux-agent-wheel-'));
  const homeDir = join(rootDir, 'home');
  const workspaceRoot = join(rootDir, 'workspace');
  const repoPath = join(workspaceRoot, 'repo-main');
  const worktreePath = join(workspaceRoot, 'repo-feature-wheel-scroll');
  const repoName = 'repo-main';
  const worktreeBranch = 'feature-wheel-scroll';
  const uiSessionId = `ui-wheel-${randomUUID()}`;
  const sessionDisplayName = 'Wheel Probe';
  const profileName = `e2e-wheel-${uiSessionId}`;
  const repoId = buildRepositoryId('local', repoPath, {
    platform: resolveWorkspacePlatform(),
  });

  await mkdir(homeDir, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await createGitRepositoryFixture(repoPath, worktreePath);

  const { probeScriptPath, probeLogPath } = await installWheelProbeScript(rootDir);
  const browserLocalStorage = buildBrowserLocalStorageSnapshot({
    repoId,
    repoName,
    repoPath,
    worktreePath,
    uiSessionId,
    sessionDisplayName,
    probeScriptPath,
    probeLogPath,
  });

  return {
    homeDir,
    profileName,
    repoPath,
    repoName,
    repoId,
    worktreePath,
    worktreeBranch,
    uiSessionId,
    sessionDisplayName,
    sessionPanelId: `agent-session-panel-${uiSessionId}`,
    probeScriptPath,
    probeLogPath,
    browserLocalStorage,
    cleanup: async () => {
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}

export async function readProbeLog(probeLogPath: string): Promise<string> {
  try {
    return await readFile(probeLogPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

export async function waitForProbeMarker(
  probeLogPath: string,
  marker: string,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      await access(probeLogPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const content = await readProbeLog(probeLogPath);
    if (content.includes(marker)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, PROBE_POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting ${String(timeoutMs)}ms for probe marker ${marker}`);
}
