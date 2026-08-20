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
import { afterEach, describe, expect, it } from 'vitest';
import { AgentRuntimeHomeService } from '../AgentRuntimeHomeService';
import { CodexRuntimeHomeService } from '../CodexRuntimeHomeService';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'infilux-codex-runtime-home-'));
  tempRoots.push(root);
  return root;
}

describe('CodexRuntimeHomeService', () => {
  const originalCodexHome = process.env.CODEX_HOME;
  const originalHome = process.env.HOME;

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
    });
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

  it('migrates existing runtime session files into the worktree history before linking it', async () => {
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
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const result = await service.prepareRuntimeHome('ui-session-legacy', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });

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

  it('does not import another worktree when replacing a legacy shared sessions link', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
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
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    await service.prepareRuntimeHome('legacy-shared-home', {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
    });

    expect(existsSync(path.join(workspaceSessionsPath, matchingRelativePath))).toBe(true);
    expect(existsSync(path.join(workspaceSessionsPath, siblingRelativePath))).toBe(false);
  });

  it('keeps concurrent UI runtime homes on one worktree history', async () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const workspaceSessionsPath = path.join(createTempRoot(), 'sessions');
    const legacySessionsPath = createTempRoot();
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
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);
    const options = {
      sessionHistoryPath: workspaceSessionsPath,
      sessionHistoryScope: { worktreePath: '/repo/worktree-a' },
      legacySessionPaths: [legacySessionsPath],
    };

    const [firstRuntimeHome, secondRuntimeHome] = await Promise.all([
      service.prepareRuntimeHome('ui-session-one', options),
      service.prepareRuntimeHome('ui-session-two', options),
    ]);

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
    } as Parameters<CodexRuntimeHomeService['pruneOrphanedRuntimeHomes']>[0] & {
      retainedHomePaths: string[];
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

    const releaseRuntimeHome = Reflect.get(service, 'releaseRuntimeHome') as
      | ((homePath: string) => Promise<boolean>)
      | undefined;

    expect(releaseRuntimeHome).toBeTypeOf('function');
    await expect(releaseRuntimeHome?.call(service, runtimeHome.homePath)).resolves.toBe(true);
    expect(existsSync(runtimeHome.homePath)).toBe(false);
    expect(readFileSync(historyPath, 'utf8')).toBe('worktree-history');
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
