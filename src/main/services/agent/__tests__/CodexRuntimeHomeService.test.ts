import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
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

  it('creates an isolated runtime home and links shared Codex configuration entries', () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    writeFileSync(path.join(sourceHome, 'auth.json'), '{}');
    writeFileSync(path.join(sourceHome, 'config.toml'), 'model = "gpt-5.5"');
    mkdirSync(path.join(sourceHome, 'sessions'), { recursive: true });
    writeFileSync(path.join(sourceHome, 'sessions', 'global-history.jsonl'), 'global');
    mkdirSync(path.join(sourceHome, 'plugins', 'cache', 'marketplace', 'review-plugin'), {
      recursive: true,
    });
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const result = service.prepareRuntimeHome('session/with spaces');

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
    expect(lstatSync(path.join(result.homePath, 'sessions')).isSymbolicLink()).toBe(false);
    expect(existsSync(path.join(result.homePath, 'sessions', 'global-history.jsonl'))).toBe(false);
  });

  it('resolves the scoped Codex home when the application config is initialized after module loading', () => {
    const homeDir = createTempRoot();
    const scopedCodexHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    process.env.HOME = homeDir;
    delete process.env.CODEX_HOME;
    mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
    writeFileSync(path.join(homeDir, '.codex', 'config.toml'), 'model = "global-model"');
    const service = new CodexRuntimeHomeService(undefined, runtimeRoot);

    writeFileSync(path.join(scopedCodexHome, 'config.toml'), 'model = "scoped-model"');
    process.env.CODEX_HOME = scopedCodexHome;

    const result = service.prepareRuntimeHome('scoped-session');

    expect(result.sourceHomePath).toBe(scopedCodexHome);
    expect(readlinkSync(path.join(result.homePath, 'config.toml'))).toBe(
      path.join(scopedCodexHome, 'config.toml')
    );
  });

  it('links marketplace snapshots into a new isolated runtime home', () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const marketplacePath = path.join(sourceHome, '.tmp', 'marketplaces');
    mkdirSync(path.join(marketplacePath, 'review-marketplace', '.claude-plugin'), {
      recursive: true,
    });
    writeFileSync(
      path.join(marketplacePath, 'review-marketplace', '.claude-plugin', 'marketplace.json'),
      '{"name":"review-marketplace"}'
    );
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const result = service.prepareRuntimeHome('new-session');

    expect(readlinkSync(path.join(result.homePath, '.tmp', 'marketplaces'))).toBe(marketplacePath);
  });

  it('migrates existing runtime session files before linking shared Codex session history', () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    const runtimeHome = path.join(runtimeRoot, 'ui-session-legacy');
    const sessionDayPath = path.join('sessions', '2026', '07', '20');
    mkdirSync(path.join(sourceHome, sessionDayPath), { recursive: true });
    mkdirSync(path.join(runtimeHome, sessionDayPath), { recursive: true });
    writeFileSync(path.join(sourceHome, sessionDayPath, 'rollout-shared.jsonl'), 'shared');
    writeFileSync(path.join(runtimeHome, sessionDayPath, 'rollout-local.jsonl'), 'local');
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const result = service.prepareRuntimeHome('ui-session-legacy', { shareSessions: true });

    expect(readlinkSync(path.join(result.homePath, 'sessions'))).toBe(
      path.join(sourceHome, 'sessions')
    );
    expect(
      readFileSync(path.join(sourceHome, sessionDayPath, 'rollout-shared.jsonl'), 'utf8')
    ).toBe('shared');
    expect(readFileSync(path.join(sourceHome, sessionDayPath, 'rollout-local.jsonl'), 'utf8')).toBe(
      'local'
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
