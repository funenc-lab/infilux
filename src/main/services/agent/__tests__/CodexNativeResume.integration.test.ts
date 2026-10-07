import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { describe, expect, it } from 'vitest';

const REQUEST_TIMEOUT_MS = 12_000;
const PROCESS_EXIT_TIMEOUT_MS = 5_000;
const CLI_COMMAND = process.platform === 'win32' ? 'codex.exe' : 'codex';
const cliProbe = spawnSync(CLI_COMMAND, ['--version'], {
  env: { PATH: process.env.PATH ?? '' },
  timeout: 5_000,
});

type RpcResponse = {
  id: number;
  result?: unknown;
  error?: { code?: number };
};

function withTimeout<T>(promise: Promise<T>, milliseconds: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${operation} timed out`)), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function createCodexEnvironment(
  home: string,
  codexHome: string,
  sqliteHome: string
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    CODEX_HOME: codexHome,
    CODEX_SQLITE_HOME: sqliteHome,
  };

  if (process.platform === 'win32') {
    environment.USERPROFILE = home;
    environment.APPDATA = path.join(home, 'AppData', 'Roaming');
    environment.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
    environment.TEMP = path.join(home, 'tmp');
    environment.TMP = environment.TEMP;
    for (const name of ['SystemRoot', 'WINDIR', 'PATHEXT', 'COMSPEC']) {
      const value = process.env[name];
      if (value) environment[name] = value;
    }
  }

  return environment;
}

class IsolatedCodexAppServer {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly lines: readline.Interface;
  private readonly exited: Promise<number | null>;
  private readonly pending = new Map<number, (response: RpcResponse) => void>();
  private nextId = 1;

  constructor(home: string, codexHome: string, sqliteHome: string, cwd: string) {
    this.process = spawn(
      CLI_COMMAND,
      ['app-server', '--listen', 'stdio://', '-c', `sqlite_home=${JSON.stringify(sqliteHome)}`],
      {
        cwd,
        env: createCodexEnvironment(home, codexHome, sqliteHome),
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    this.exited = new Promise((resolve, reject) => {
      this.process.once('error', reject);
      this.process.once('exit', resolve);
    });
    this.process.stderr.resume();
    this.lines = readline.createInterface({ input: this.process.stdout });
    this.lines.on('line', (line) => {
      let response: RpcResponse;
      try {
        response = JSON.parse(line) as RpcResponse;
      } catch {
        return;
      }
      if (typeof response.id === 'number') {
        this.pending.get(response.id)?.(response);
      }
    });
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      clientInfo: { name: 'infilux_test', title: 'Infilux Test', version: '1' },
    });
    this.process.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
  }

  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const response = await withTimeout(
      new Promise<RpcResponse>((resolve) => {
        this.pending.set(id, resolve);
        this.process.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      }),
      REQUEST_TIMEOUT_MS,
      `${method} response`
    );
    this.pending.delete(id);
    if (response.error) {
      throw new Error(`${method} failed with RPC error ${response.error.code ?? 'unknown'}`);
    }
    return response.result;
  }

  async runLocalShellCommand(threadId: string): Promise<void> {
    const completed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lines.off('line', onLine);
        reject(new Error('standalone shell turn did not complete'));
      }, REQUEST_TIMEOUT_MS);
      const onLine = (line: string) => {
        let notification: {
          method?: string;
          params?: { threadId?: string; turn?: { status?: string } };
        };
        try {
          notification = JSON.parse(line) as typeof notification;
        } catch {
          return;
        }
        if (
          notification.method === 'turn/completed' &&
          notification.params?.threadId === threadId
        ) {
          clearTimeout(timer);
          this.lines.off('line', onLine);
          if (notification.params.turn?.status !== 'completed') {
            reject(new Error('standalone shell turn ended without completing'));
          } else {
            resolve();
          }
        }
      };
      this.lines.on('line', onLine);
    });
    await Promise.all([
      this.request('thread/shellCommand', {
        threadId,
        command: process.platform === 'win32' ? 'cd' : 'pwd',
        timeoutMs: 4_000,
      }),
      completed,
    ]);
  }

  async close(): Promise<void> {
    this.process.stdin.end();
    const exitCode = await withTimeout(
      this.exited,
      PROCESS_EXIT_TIMEOUT_MS,
      'Codex app-server exit'
    );
    this.lines.close();
    expect(exitCode).toBe(0);
  }

  async forceStop(): Promise<void> {
    this.process.kill();
    try {
      await withTimeout(this.exited, PROCESS_EXIT_TIMEOUT_MS, 'Codex app-server cleanup');
    } finally {
      this.lines.close();
    }
  }
}

function collectJsonlFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectJsonlFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(entryPath);
  }
  return files;
}

function readThreadIdentity(filePath: string): { id: string; cwd: string; source: string } | null {
  const firstLine = readFileSync(filePath, 'utf8').split('\n', 1)[0];
  const record = JSON.parse(firstLine) as {
    type?: unknown;
    payload?: { id?: unknown; cwd?: unknown; source?: unknown };
  };
  if (
    record.type !== 'session_meta' ||
    typeof record.payload?.id !== 'string' ||
    typeof record.payload.cwd !== 'string' ||
    typeof record.payload.source !== 'string'
  ) {
    return null;
  }
  return { id: record.payload.id, cwd: record.payload.cwd, source: record.payload.source };
}

function threadIds(result: unknown): string[] {
  const response = result as { data?: Array<{ id?: unknown }> };
  if (!Array.isArray(response?.data)) throw new Error('thread/list returned no data array');
  return response.data.flatMap((thread) => (typeof thread.id === 'string' ? [thread.id] : []));
}

describe('real Codex app-server transcript discovery', () => {
  if (cliProbe.error && 'code' in cliProbe.error && cliProbe.error.code === 'ENOENT') {
    it.skip('requires an installed codex executable on PATH', () => {});
    return;
  }

  it('indexes native rollouts with a synthetic user event using an independent empty SQLite home', async () => {
    if (cliProbe.error || cliProbe.status !== 0) {
      throw new Error('installed codex --version did not complete successfully');
    }

    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'infilux-native-codex-resume-'));
    const home = path.join(temporaryRoot, 'isolated-user-home');
    const sourceHome = path.join(temporaryRoot, 'source-codex-home');
    const targetHome = path.join(temporaryRoot, 'target-codex-home');
    const sourceSqliteHome = path.join(temporaryRoot, 'source-sqlite');
    const targetSqliteHome = path.join(temporaryRoot, 'target-sqlite');
    const worktree = path.join(temporaryRoot, 'worktree-a');
    const sibling = path.join(temporaryRoot, 'worktree-b');
    const servers: IsolatedCodexAppServer[] = [];

    try {
      for (const directory of [
        home,
        sourceHome,
        targetHome,
        sourceSqliteHome,
        targetSqliteHome,
        worktree,
        sibling,
      ]) {
        mkdirSync(directory, { recursive: true });
      }
      if (process.platform === 'win32') {
        for (const relativePath of ['AppData/Roaming', 'AppData/Local', 'tmp']) {
          mkdirSync(path.join(home, relativePath), { recursive: true });
        }
      }

      const source = new IsolatedCodexAppServer(home, sourceHome, sourceSqliteHome, worktree);
      servers.push(source);
      await source.initialize();
      const matching = (await source.request('thread/start', { cwd: worktree })) as {
        thread?: { id?: string };
      };
      const other = (await source.request('thread/start', { cwd: sibling })) as {
        thread?: { id?: string };
      };
      const matchingId = matching.thread?.id;
      const siblingId = other.thread?.id;
      if (!matchingId || !siblingId) throw new Error('thread/start returned no thread id');
      expect(siblingId).not.toBe(matchingId);
      for (const threadId of [matchingId, siblingId]) {
        await source.runLocalShellCommand(threadId);
      }
      await source.close();

      expect(existsSync(path.join(sourceHome, 'sessions'))).toBe(true);
      const originalFiles = collectJsonlFiles(path.join(sourceHome, 'sessions'));
      const originalIdentities = originalFiles.map(readThreadIdentity);
      expect(originalIdentities).toHaveLength(2);
      const sourceKind = originalIdentities[0]?.source;
      if (!sourceKind) throw new Error('native Codex rollout is missing a source kind');
      expect(originalIdentities).toEqual(
        expect.arrayContaining([
          { id: matchingId, cwd: worktree, source: sourceKind },
          { id: siblingId, cwd: sibling, source: sourceKind },
        ])
      );
      // A model-free shell turn does not emit a user_message; Codex omits such threads from listings.
      // Add only the user event to Codex's own generated rollout, never to a real Codex home.
      for (const filePath of originalFiles) {
        appendFileSync(
          filePath,
          `${JSON.stringify({
            timestamp: new Date().toISOString(),
            type: 'event_msg',
            payload: { type: 'user_message', message: 'Isolated resume test fixture.' },
          })}\n`,
          'utf8'
        );
      }
      const sourceReadback = new IsolatedCodexAppServer(
        home,
        sourceHome,
        sourceSqliteHome,
        worktree
      );
      servers.push(sourceReadback);
      await sourceReadback.initialize();
      const sourceResult = await sourceReadback.request('thread/list', {
        cwd: worktree,
        sourceKinds: [sourceKind],
      });
      expect(threadIds(sourceResult)).toContain(matchingId);
      expect(threadIds(sourceResult)).not.toContain(siblingId);
      await sourceReadback.close();
      expect(sourceSqliteHome).not.toBe(targetSqliteHome);
      expect(readdirSync(targetSqliteHome)).toEqual([]);

      for (const filePath of originalFiles) {
        const relativePath = path.relative(path.join(sourceHome, 'sessions'), filePath);
        const destinationPath = path.join(targetHome, 'sessions', relativePath);
        mkdirSync(path.dirname(destinationPath), { recursive: true });
        copyFileSync(filePath, destinationPath);
      }

      const target = new IsolatedCodexAppServer(home, targetHome, targetSqliteHome, worktree);
      servers.push(target);
      await target.initialize();
      const matchingResult = await target.request('thread/list', {
        cwd: worktree,
        sourceKinds: [sourceKind],
      });
      expect(threadIds(matchingResult)).toContain(matchingId);
      expect(threadIds(matchingResult)).not.toContain(siblingId);

      const siblingResult = await target.request('thread/list', {
        cwd: sibling,
        sourceKinds: [sourceKind],
      });
      expect(threadIds(siblingResult)).toContain(siblingId);
      expect(threadIds(siblingResult)).not.toContain(matchingId);

      // App-server's interactive default is cli/vscode; this does not test the CLI TUI picker.
      const defaultResult = await target.request('thread/list', { cwd: worktree });
      expect(threadIds(defaultResult).includes(matchingId)).toBe(
        sourceKind === 'cli' || sourceKind === 'vscode'
      );
      await target.close();
    } finally {
      await Promise.allSettled(servers.map((server) => server.forceStop()));
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }, 40_000);
});
