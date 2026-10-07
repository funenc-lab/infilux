import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../../../utils/logger';
import { AgentRuntimeHomeService } from '../AgentRuntimeHomeService';
import type {
  CodexWorkspaceHistoryMigrationOperation,
  CodexWorkspaceHistoryMigrationScheduler,
} from '../CodexWorkspaceHistoryMigrationCoordinator';
import {
  resolveCodexWorkspaceSessionHistoryPath,
  resolveCodexWorkspaceSqliteHomePath,
} from '../CodexWorkspaceSessionHistory';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    once: vi.fn(),
  },
}));

vi.mock('../../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const tempRoots: string[] = [];
let CodexRuntimeHomeService: typeof import('../CodexRuntimeHomeService').CodexRuntimeHomeService;

function createTempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'infilux-codex-runtime-home-'));
  tempRoots.push(root);
  return root;
}

function createControlledMigrationCoordinator(): {
  coordinator: CodexWorkspaceHistoryMigrationScheduler;
  flush: () => Promise<void>;
} {
  const operations: CodexWorkspaceHistoryMigrationOperation[] = [];

  return {
    coordinator: {
      schedule: (_key, operation) => {
        operations.push(operation);
        return Promise.resolve();
      },
    },
    async flush() {
      while (operations.length > 0) {
        await operations.shift()?.();
      }
    },
  };
}

describe('CodexRuntimeHomeService', () => {
  const originalCodexHome = process.env.CODEX_HOME;
  const originalHome = process.env.HOME;

  beforeEach(async () => {
    ({ CodexRuntimeHomeService } = await import('../CodexRuntimeHomeService'));
  });

  afterEach(() => {
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates an isolated runtime home and links shared Codex configuration entries', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    writeFileSync(path.join(sourceHome, 'auth.json'), '{}');
    writeFileSync(path.join(sourceHome, 'config.toml'), 'model = "gpt-5.5"');
    mkdirSync(path.join(sourceHome, 'sessions'), { recursive: true });
    writeFileSync(path.join(sourceHome, 'sessions', 'global-history.jsonl'), 'global');
    mkdirSync(path.join(sourceHome, 'plugins', 'cache', 'marketplace', 'review-plugin'), {
      recursive: true,
    });
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const result = await service.prepareRuntimeHome('session/with spaces', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });

    expect(result).toEqual({
      homePath: path.join(runtimeRoot, 'session-with-spaces'),
      sourceHomePath: sourceHome,
      sqliteHomePath: path.join(path.dirname(workspaceSessionsPath), 'sqlite'),
    });
    expect(existsSync(path.join(result.homePath, '.infilux-managed-runtime-home-v1'))).toBe(true);
    expect(readlinkSync(path.join(result.homePath, 'auth.json'))).toBe(
      path.join(sourceHome, 'auth.json')
    );
    expect(readlinkSync(path.join(result.homePath, 'config.toml'))).toBe(
      path.join(sourceHome, 'config.toml')
    );
    expect(readlinkSync(path.join(result.homePath, 'plugins'))).toBe(
      path.join(sourceHome, 'plugins')
    );
    expect(readlinkSync(path.join(result.homePath, 'sessions'))).toBe(workspaceSessionsPath);
    expect(existsSync(path.join(workspaceSessionsPath, 'global-history.jsonl'))).toBe(false);
  });

  it('rejects a pre-existing symlink to a sibling worktree SQLite directory before launch', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const siblingSqlitePath = path.join(createTempRoot(), 'sqlite');
    mkdirSync(siblingSqlitePath, { recursive: true });
    symlinkSync(
      siblingSqlitePath,
      path.join(path.dirname(workspaceSessionsPath), 'sqlite'),
      process.platform === 'win32' ? 'junction' : undefined
    );
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    await expect(
      service.prepareRuntimeHome('ui-session', {
        sessionHistoryPath: workspaceSessionsPath,
        sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
      })
    ).rejects.toThrow('Codex worktree SQLite directory must not be a symlink');
    expect(existsSync(path.join(siblingSqlitePath, 'state_5.sqlite'))).toBe(false);
  });

  it('imports only matching user-global session history into an Infilux runtime home', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const relativeSessionPath = path.join('2026', '09', '09', 'global-session.jsonl');
    const siblingSessionPath = path.join('2026', '09', '09', 'sibling-session.jsonl');
    const migration = createControlledMigrationCoordinator();
    mkdirSync(path.dirname(path.join(sourceHome, 'sessions', relativeSessionPath)), {
      recursive: true,
    });
    writeFileSync(
      path.join(sourceHome, 'sessions', relativeSessionPath),
      `${JSON.stringify({
        type: 'session_meta',
        payload: { id: 'fe9d211b-272a-4ee7-a08c-2e23349542c2', cwd: '/repo/worktree-a' },
      })}\n${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Hi' } })}\n`
    );
    writeFileSync(
      path.join(sourceHome, 'sessions', siblingSessionPath),
      `${JSON.stringify({
        type: 'session_meta',
        payload: { id: 'f164724d-c72b-4e9d-86f1-a4ba931c7c36', cwd: '/repo/worktree-b' },
      })}\n${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Sibling' } })}\n`
    );
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot, migration.coordinator);

    await service.prepareRuntimeHome('isolated-session', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });
    await migration.flush();

    expect(existsSync(path.join(workspaceSessionsPath, relativeSessionPath))).toBe(true);
    expect(existsSync(path.join(workspaceSessionsPath, siblingSessionPath))).toBe(false);
  });

  it('imports a newly completed post-marker external transcript before returning', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const migration = createControlledMigrationCoordinator();
    const relativeSessionPath = path.join('2026', '10', '07', 'rollout-new-external.jsonl');
    const sourceFile = path.join(sourceHome, 'sessions', relativeSessionPath);
    mkdirSync(path.dirname(sourceFile), { recursive: true });
    const bytes = `${JSON.stringify({
      type: 'session_meta',
      payload: { id: 'fe9d211b-272a-4ee7-a08c-2e23349542c2', cwd: '/repo/worktree-a' },
    })}\n${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Hi' } })}\n`;
    writeFileSync(sourceFile, bytes);
    mkdirSync(path.dirname(workspaceSessionsPath), { recursive: true });
    writeFileSync(
      path.join(path.dirname(workspaceSessionsPath), '.legacy-session-history-migrated-v2'),
      'completed'
    );
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot, migration.coordinator);

    const result = await service.prepareRuntimeHome('fresh-ui-session', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });

    expect(readFileSync(path.join(workspaceSessionsPath, relativeSessionPath), 'utf8')).toBe(bytes);
    expect(result.sqliteHomePath).toBe(path.join(path.dirname(workspaceSessionsPath), 'sqlite'));
  });

  it('does not let deferred legacy migration publish an unfinished external transcript', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const migration = createControlledMigrationCoordinator();
    const relativeSessionPath = path.join('2026', '10', '07', 'unfinished-external.jsonl');
    const sourceFile = path.join(sourceHome, 'sessions', relativeSessionPath);
    mkdirSync(path.dirname(sourceFile), { recursive: true });
    writeFileSync(
      sourceFile,
      `${JSON.stringify({
        type: 'session_meta',
        payload: { id: 'fe9d211b-272a-4ee7-a08c-2e23349542c2', cwd: '/repo/worktree-a' },
      })}\n{"type":"event_msg","payload":{"message":"unfinished"` // No final newline.
    );
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot, migration.coordinator);
    vi.mocked(log.warn).mockClear();

    await service.prepareRuntimeHome('new-ui-session', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });
    await migration.flush();

    expect(existsSync(path.join(workspaceSessionsPath, relativeSessionPath))).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('initial resume list may be incomplete')
    );
    expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain(sourceFile);
  });

  it('skips importing when the external sessions symlink resolves inside this worktree history', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    mkdirSync(workspaceSessionsPath, { recursive: true });
    symlinkSync(workspaceSessionsPath, path.join(sourceHome, 'sessions'));
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    await expect(
      service.prepareRuntimeHome('symlink-source-session', {
        sessionHistoryPath: workspaceSessionsPath,
        sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
      })
    ).resolves.toMatchObject({
      sqliteHomePath: path.join(path.dirname(workspaceSessionsPath), 'sqlite'),
    });
  });

  it('resolves the scoped Codex home when the application config is initialized after module loading', async () => {
    const homeDir = createTempRoot();
    const scopedCodexHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    process.env.HOME = homeDir;
    delete process.env.CODEX_HOME;
    mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
    writeFileSync(path.join(homeDir, '.codex', 'config.toml'), 'model = "global-model"');
    const service = new CodexRuntimeHomeService(undefined, runtimeRoot);

    writeFileSync(path.join(scopedCodexHome, 'config.toml'), 'model = "scoped-model"');
    process.env.CODEX_HOME = scopedCodexHome;

    const result = await service.prepareRuntimeHome('scoped-session', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });

    expect(result.sourceHomePath).toBe(scopedCodexHome);
    expect(readlinkSync(path.join(result.homePath, 'config.toml'))).toBe(
      path.join(scopedCodexHome, 'config.toml')
    );
  });

  it('links marketplace snapshots into a new isolated runtime home', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const marketplacePath = path.join(sourceHome, '.tmp', 'marketplaces');
    mkdirSync(path.join(marketplacePath, 'review-marketplace', '.claude-plugin'), {
      recursive: true,
    });
    writeFileSync(
      path.join(marketplacePath, 'review-marketplace', '.claude-plugin', 'marketplace.json'),
      '{"name":"review-marketplace"}'
    );
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const result = await service.prepareRuntimeHome('new-session', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });

    expect(readlinkSync(path.join(result.homePath, '.tmp', 'marketplaces'))).toBe(marketplacePath);
  });

  it('returns before importing legacy runtime sessions', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const runtimeHome = path.join(runtimeRoot, 'ui-session-legacy');
    const relativeSessionPath = path.join('2026', '08', '20', 'rollout-local.jsonl');
    const scheduledOperations: CodexWorkspaceHistoryMigrationOperation[] = [];
    const migrationCoordinator = {
      schedule: (_key: string, operation: CodexWorkspaceHistoryMigrationOperation) => {
        scheduledOperations.push(operation);
        return Promise.resolve();
      },
    };
    mkdirSync(path.dirname(path.join(runtimeHome, 'sessions', relativeSessionPath)), {
      recursive: true,
    });
    writeFileSync(
      path.join(runtimeHome, 'sessions', relativeSessionPath),
      `${JSON.stringify({
        type: 'session_meta',
        payload: { id: 'local-session', cwd: '/repo/worktree-a' },
      })}\nlocal`
    );
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot, migrationCoordinator);

    const result = await service.prepareRuntimeHome('ui-session-legacy', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });

    expect(readlinkSync(path.join(result.homePath, 'sessions'))).toBe(workspaceSessionsPath);
    expect(existsSync(path.join(workspaceSessionsPath, relativeSessionPath))).toBe(false);
    expect(scheduledOperations).toHaveLength(1);

    await scheduledOperations[0]?.();

    expect(readFileSync(path.join(workspaceSessionsPath, relativeSessionPath), 'utf8')).toContain(
      'local-session'
    );
  });

  it('migrates existing runtime session files after linking the worktree history', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const runtimeHome = path.join(runtimeRoot, 'ui-session-legacy');
    const sessionDayPath = path.join('sessions', '2026', '07', '20');
    mkdirSync(path.join(workspaceSessionsPath, '2026', '07', '20'), { recursive: true });
    mkdirSync(path.join(runtimeHome, sessionDayPath), { recursive: true });
    writeFileSync(
      path.join(workspaceSessionsPath, '2026', '07', '20', 'rollout-worktree.jsonl'),
      'worktree'
    );
    writeFileSync(
      path.join(runtimeHome, sessionDayPath, 'rollout-local.jsonl'),
      `${JSON.stringify({
        type: 'session_meta',
        payload: { cwd: '/repo/worktree-a' },
      })}\nlocal`
    );
    const migration = createControlledMigrationCoordinator();
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot, migration.coordinator);

    const result = await service.prepareRuntimeHome('ui-session-legacy', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });

    await migration.flush();

    expect(readlinkSync(path.join(result.homePath, 'sessions'))).toBe(workspaceSessionsPath);
    expect(
      readFileSync(
        path.join(workspaceSessionsPath, '2026', '07', '20', 'rollout-worktree.jsonl'),
        'utf8'
      )
    ).toBe('worktree');
    expect(
      readFileSync(
        path.join(workspaceSessionsPath, '2026', '07', '20', 'rollout-local.jsonl'),
        'utf8'
      )
    ).toContain('local');
  });

  it('does not import an external legacy sessions link', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const historyRoot = createTempRoot();
    const workspaceSessionsPath = resolveCodexWorkspaceSessionHistoryPath({
      historyRoot,
      worktreePath: '/repo/worktree-a',
    });
    const sharedSessionsPath = path.join(createTempRoot(), 'sessions');
    const runtimeHome = path.join(runtimeRoot, 'legacy-shared-home');
    const matchingRelativePath = path.join('2026', '08', '20', 'feature-a.jsonl');
    const siblingRelativePath = path.join('2026', '08', '20', 'feature-b.jsonl');
    mkdirSync(path.join(sharedSessionsPath, '2026', '08', '20'), { recursive: true });
    mkdirSync(runtimeHome, { recursive: true });
    writeFileSync(
      path.join(sharedSessionsPath, matchingRelativePath),
      `${JSON.stringify({
        type: 'session_meta',
        payload: { cwd: '/repo/worktree-a' },
      })}\n`
    );
    writeFileSync(
      path.join(sharedSessionsPath, siblingRelativePath),
      `${JSON.stringify({
        type: 'session_meta',
        payload: { cwd: '/repo/worktree-b' },
      })}\n`
    );
    symlinkSync(sharedSessionsPath, path.join(runtimeHome, 'sessions'));
    const migration = createControlledMigrationCoordinator();
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot, migration.coordinator);

    await service.prepareRuntimeHome('legacy-shared-home', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });

    await migration.flush();

    expect(existsSync(path.join(workspaceSessionsPath, matchingRelativePath))).toBe(false);
    expect(existsSync(path.join(workspaceSessionsPath, siblingRelativePath))).toBe(false);
  });

  it('recovers sessions misfiled in an isolated workspace history despite a v1 marker', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const historyRoot = createTempRoot();
    const worktreePath = '/repo/worktree-a';
    const workspaceSessionsPath = resolveCodexWorkspaceSessionHistoryPath({
      historyRoot,
      worktreePath,
    });
    const siblingSessionsPath = resolveCodexWorkspaceSessionHistoryPath({
      historyRoot,
      worktreePath: '/repo/worktree-b',
    });
    const isolatedRuntimeHome = path.join(runtimeRoot, 'previous-worktree-session');
    const relativeSessionPath = path.join('2026', '08', '20', 'already-isolated.jsonl');
    mkdirSync(path.dirname(path.join(siblingSessionsPath, relativeSessionPath)), {
      recursive: true,
    });
    writeFileSync(
      path.join(siblingSessionsPath, relativeSessionPath),
      `${JSON.stringify({
        type: 'session_meta',
        payload: { id: 'isolated-session', cwd: worktreePath },
      })}\n`
    );
    mkdirSync(path.dirname(workspaceSessionsPath), { recursive: true });
    writeFileSync(
      path.join(path.dirname(workspaceSessionsPath), '.legacy-session-history-migrated-v1'),
      'legacy migration completed'
    );
    mkdirSync(isolatedRuntimeHome, { recursive: true });
    symlinkSync(siblingSessionsPath, path.join(isolatedRuntimeHome, 'sessions'));
    const migration = createControlledMigrationCoordinator();
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot, migration.coordinator);

    await service.prepareRuntimeHome('new-worktree-session', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath },
    });
    await migration.flush();

    expect(readFileSync(path.join(workspaceSessionsPath, relativeSessionPath), 'utf8')).toContain(
      'isolated-session'
    );
  });

  it('keeps concurrent UI runtime homes on one worktree history', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const legacySessionsPath = path.join(runtimeRoot, 'ui-session-one', 'sessions');
    const relativeSessionPath = path.join('2026', '08', '20', 'concurrent-worktree.jsonl');
    mkdirSync(path.dirname(path.join(legacySessionsPath, relativeSessionPath)), {
      recursive: true,
    });
    writeFileSync(
      path.join(legacySessionsPath, relativeSessionPath),
      `${JSON.stringify({
        type: 'session_meta',
        payload: { cwd: '/repo/worktree-a' },
      })}\n`
    );
    const migration = createControlledMigrationCoordinator();
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot, migration.coordinator);
    const options = {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    };

    const [firstRuntimeHome, secondRuntimeHome] = await Promise.all([
      service.prepareRuntimeHome('ui-session-one', options),
      service.prepareRuntimeHome('ui-session-two', options),
    ]);

    await migration.flush();

    expect(readlinkSync(path.join(firstRuntimeHome.homePath, 'sessions'))).toBe(
      workspaceSessionsPath
    );
    expect(readlinkSync(path.join(secondRuntimeHome.homePath, 'sessions'))).toBe(
      workspaceSessionsPath
    );
    expect(readFileSync(path.join(workspaceSessionsPath, relativeSessionPath), 'utf8')).toContain(
      'worktree-a'
    );
  });

  it('keeps SQLite stable across UI runtime homes while separating sibling worktrees', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const historyRoot = path.join(createTempRoot(), 'history with spaces');
    const scope = { historyRoot, worktreePath: '/repo/worktree with spaces' };
    const siblingScope = { historyRoot, worktreePath: '/repo/sibling-worktree' };
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const [first, second, sibling] = await Promise.all([
      service.prepareRuntimeHome('ui-session-one', {
        sessionHistoryPath: resolveCodexWorkspaceSessionHistoryPath(scope),
        sessionHistoryScope: scope,
      }),
      service.prepareRuntimeHome('ui-session-two', {
        sessionHistoryPath: resolveCodexWorkspaceSessionHistoryPath(scope),
        sessionHistoryScope: scope,
      }),
      service.prepareRuntimeHome('ui-session-three', {
        sessionHistoryPath: resolveCodexWorkspaceSessionHistoryPath(siblingScope),
        sessionHistoryScope: siblingScope,
      }),
    ]);

    expect(first.homePath).not.toBe(second.homePath);
    expect(first.sqliteHomePath).toBe(resolveCodexWorkspaceSqliteHomePath(scope));
    expect(first.sqliteHomePath).toBe(second.sqliteHomePath);
    expect(first.sqliteHomePath).not.toBe(sibling.sqliteHomePath);
    expect(existsSync(first.sqliteHomePath)).toBe(true);
    expect(existsSync(sibling.sqliteHomePath)).toBe(true);
  });

  it('prunes old orphaned Codex runtime homes while retaining active and recent homes', () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const oldOrphanHome = path.join(runtimeRoot, 'old-orphan');
    const activeHome = path.join(runtimeRoot, 'active-session');
    const activeHomeByPath = path.join(runtimeRoot, 'active-session-by-path');
    const recentHome = path.join(runtimeRoot, 'recent-orphan');
    mkdirSync(oldOrphanHome, { recursive: true });
    mkdirSync(activeHome, { recursive: true });
    mkdirSync(activeHomeByPath, { recursive: true });
    mkdirSync(recentHome, { recursive: true });
    writeFileSync(path.join(oldOrphanHome, 'state_5.sqlite'), '');
    writeFileSync(path.join(activeHome, 'state_5.sqlite'), '');
    writeFileSync(path.join(activeHomeByPath, 'state_5.sqlite'), '');
    writeFileSync(path.join(recentHome, 'state_5.sqlite'), '');

    const oldTimestamp = new Date('2026-01-01T00:00:00.000Z');
    const recentTimestamp = new Date('2026-04-09T00:00:00.000Z');
    for (const targetPath of [oldOrphanHome, path.join(oldOrphanHome, 'state_5.sqlite')]) {
      utimesSync(targetPath, oldTimestamp, oldTimestamp);
    }
    for (const targetPath of [activeHome, path.join(activeHome, 'state_5.sqlite')]) {
      utimesSync(targetPath, oldTimestamp, oldTimestamp);
    }
    for (const targetPath of [activeHomeByPath, path.join(activeHomeByPath, 'state_5.sqlite')]) {
      utimesSync(targetPath, oldTimestamp, oldTimestamp);
    }
    for (const targetPath of [recentHome, path.join(recentHome, 'state_5.sqlite')]) {
      utimesSync(targetPath, recentTimestamp, recentTimestamp);
    }

    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const pruneOptions = {
      retainedRuntimeKeys: ['active-session'],
      retainedHomePaths: [activeHomeByPath],
      minAgeMs: 30 * 24 * 60 * 60 * 1_000,
      now: Date.parse('2026-04-10T00:00:00.000Z'),
    };

    const result = service.pruneOrphanedRuntimeHomes(pruneOptions);

    expect(result).toEqual({
      prunedHomePaths: [oldOrphanHome],
      retainedHomePaths: expect.arrayContaining([activeHome, activeHomeByPath, recentHome]),
      skippedHomePaths: [],
    });
    expect(existsSync(oldOrphanHome)).toBe(false);
    expect(existsSync(activeHome)).toBe(true);
    expect(existsSync(activeHomeByPath)).toBe(true);
    expect(existsSync(recentHome)).toBe(true);
  });

  it('prunes an untracked runtime home by its own lifetime without traversing nested state', () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const orphanHome = path.join(runtimeRoot, 'old-orphan-with-recent-state');
    const nestedStatePath = path.join(orphanHome, 'nested', 'state_5.sqlite');
    mkdirSync(path.dirname(nestedStatePath), { recursive: true });
    writeFileSync(nestedStatePath, 'runtime-state');

    const oldTimestamp = new Date('2026-01-01T00:00:00.000Z');
    const recentTimestamp = new Date('2026-04-09T00:00:00.000Z');
    utimesSync(orphanHome, oldTimestamp, oldTimestamp);
    utimesSync(nestedStatePath, recentTimestamp, recentTimestamp);

    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);
    const result = service.pruneOrphanedRuntimeHomes({
      retainedRuntimeKeys: [],
      minAgeMs: 30 * 24 * 60 * 60 * 1_000,
      now: Date.parse('2026-04-10T00:00:00.000Z'),
    });

    expect(result.prunedHomePaths).toEqual([orphanHome]);
    expect(existsSync(orphanHome)).toBe(false);
  });

  it('releases an explicitly terminated runtime home without deleting its worktree session history', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const historyPath = path.join(workspaceSessionsPath, '2026', '08', '20', 'resume.jsonl');
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const runtimeHome = await service.prepareRuntimeHome('session-to-close', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });
    mkdirSync(path.dirname(historyPath), { recursive: true });
    writeFileSync(historyPath, 'worktree-history');
    writeFileSync(path.join(runtimeHome.homePath, 'state_5.sqlite'), 'runtime-state');
    const stableSqlitePath = path.join(runtimeHome.sqliteHomePath, 'state_5.sqlite');
    writeFileSync(stableSqlitePath, 'persistent-worktree-state');

    const releaseRuntimeHome = Reflect.get(service, 'releaseRuntimeHome') as
      | ((homePath: string) => Promise<boolean>)
      | undefined;

    expect(releaseRuntimeHome).toBeTypeOf('function');
    await expect(releaseRuntimeHome?.call(service, runtimeHome.homePath)).resolves.toBe(true);
    expect(existsSync(runtimeHome.homePath)).toBe(false);
    expect(readFileSync(historyPath, 'utf8')).toBe('worktree-history');
    expect(readFileSync(stableSqlitePath, 'utf8')).toBe('persistent-worktree-state');
  });

  it('retains the worktree SQLite directory after pruning an orphaned UI runtime home', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);
    const runtimeHome = await service.prepareRuntimeHome('old-session', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });
    const stableSqlitePath = path.join(runtimeHome.sqliteHomePath, 'state_5.sqlite');
    writeFileSync(stableSqlitePath, 'persistent-worktree-state');
    const oldTimestamp = new Date('2026-01-01T00:00:00.000Z');
    utimesSync(runtimeHome.homePath, oldTimestamp, oldTimestamp);

    const pruneResult = service.pruneOrphanedRuntimeHomes({
      retainedRuntimeKeys: [],
      minAgeMs: 30 * 24 * 60 * 60 * 1_000,
      now: Date.parse('2026-04-10T00:00:00.000Z'),
    });

    expect(pruneResult.prunedHomePaths).toEqual([runtimeHome.homePath]);
    expect(existsSync(runtimeHome.homePath)).toBe(false);
    expect(readFileSync(stableSqlitePath, 'utf8')).toBe('persistent-worktree-state');
  });

  it('refuses to release paths outside the managed runtime root', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const externalHome = createTempRoot();
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);
    const runtimeHome = await service.prepareRuntimeHome('active-session', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });
    const releaseRuntimeHome = Reflect.get(service, 'releaseRuntimeHome') as
      | ((homePath: string) => Promise<boolean>)
      | undefined;

    expect(releaseRuntimeHome).toBeTypeOf('function');
    await expect(releaseRuntimeHome?.call(service, runtimeRoot)).resolves.toBe(false);
    await expect(releaseRuntimeHome?.call(service, externalHome)).resolves.toBe(false);
    expect(existsSync(runtimeHome.homePath)).toBe(true);
    expect(existsSync(externalHome)).toBe(true);
  });

  it('serializes operations for the same agent runtime key without blocking unrelated keys', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const service = new AgentRuntimeHomeService({
      sourceHomePath: sourceHome,
      runtimeRootPath: runtimeRoot,
      sharedEntryNames: [],
    });
    const events: string[] = [];
    let releaseFirst: () => void = () => {
      throw new Error('First lock release callback was not initialized');
    };

    const first = service.runExclusive('same/session', async () => {
      events.push('first-start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first-end');
      return 'first';
    });
    const second = service.runExclusive('same session', async () => {
      events.push('second-start');
      return 'second';
    });
    const unrelated = service.runExclusive('other-session', async () => {
      events.push('other-start');
      return 'other';
    });

    await expect(unrelated).resolves.toBe('other');
    expect(events).toEqual(['first-start', 'other-start']);
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(events).toEqual(['first-start', 'other-start', 'first-end', 'second-start']);
  });
});
