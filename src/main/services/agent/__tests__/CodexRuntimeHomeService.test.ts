import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates an isolated runtime home and links shared Codex configuration entries', () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    writeFileSync(path.join(sourceHome, 'auth.json'), '{}');
    writeFileSync(path.join(sourceHome, 'config.toml'), 'model = "gpt-5.5"');
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
