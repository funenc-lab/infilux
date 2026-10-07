import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importCodexExternalSessions } from '../CodexExternalSessionImport';

const simulatedTargetScan = vi.hoisted(() => ({ path: '' }));
vi.mock('../CodexWorkspaceSessionHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../CodexWorkspaceSessionHistory')>();
  return {
    ...actual,
    collectSessionFiles: async (sessionsPath: string) => {
      const collection = await actual.collectSessionFiles(sessionsPath);
      return sessionsPath === simulatedTargetScan.path
        ? { complete: false, files: [] }
        : collection;
    },
  };
});

const tempDirectories: string[] = [];
const worktreePath = '/workspace/project/feature-a';
const firstThreadId = 'fe9d211b-272a-4ee7-a08c-2e23349542c2';
const secondThreadId = 'f164724d-c72b-4e9d-86f1-a4ba931c7c36';
const provenanceSuffix = '.infilux-import.json';

function appendTranscriptLine(target: string, message: string): void {
  appendFileSync(
    target,
    `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message } })}\n`
  );
}

function createFixture(): { sourceSessionsPath: string; sessionHistoryPath: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'infilux-codex-external-import-'));
  tempDirectories.push(root);
  const sourceSessionsPath = path.join(root, 'external', 'sessions');
  const sessionHistoryPath = path.join(root, 'infilux', 'sessions');
  mkdirSync(sourceSessionsPath, { recursive: true });
  mkdirSync(sessionHistoryPath, { recursive: true });
  writeFileSync(
    path.join(path.dirname(sessionHistoryPath), '.legacy-session-history-migrated-v2'),
    'done'
  );
  return { sourceSessionsPath, sessionHistoryPath };
}

async function startSqliteWriter(databasePath: string): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(
    process.execPath,
    [
      '-e',
      [
        "const sqlite3 = require('sqlite3');",
        'const database = new sqlite3.Database(process.argv[1]);',
        "database.configure('busyTimeout', 0);",
        "database.exec('BEGIN IMMEDIATE', (error) => {",
        '  if (error) { process.stderr.write(String(error)); process.exit(1); }',
        "  process.stdout.write('locked\\n');",
        '});',
        "process.stdin.on('end', () => database.exec('ROLLBACK', () => database.close()));",
        'process.stdin.resume();',
      ].join('\n'),
      databasePath,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(([code]) => {
        throw new Error(`SQLite lock owner exited before readiness: ${code}`);
      }),
    ]);
    return child;
  } catch (error) {
    child.kill();
    throw error;
  }
}

function writeTranscript(options: {
  directory: string;
  relativePath: string;
  threadId?: string;
  cwd?: string;
  finalLine?: string;
  complete?: boolean;
}): Buffer {
  const target = path.join(options.directory, options.relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  const lines = [
    JSON.stringify({
      type: 'session_meta',
      payload: { id: options.threadId ?? firstThreadId, cwd: options.cwd ?? worktreePath },
    }),
    options.finalLine ??
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Hi' } }),
  ];
  const bytes = Buffer.from(`${lines.join('\n')}${options.complete === false ? '' : '\n'}`, 'utf8');
  writeFileSync(target, bytes);
  return bytes;
}

afterEach(() => {
  vi.restoreAllMocks();
  simulatedTargetScan.path = '';
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('importCodexExternalSessions', () => {
  it('imports a completed matching session after the legacy marker and excludes other or incomplete sessions', async () => {
    const fixture = createFixture();
    const relativePath = path.join('2026', '10', '07', `rollout-${firstThreadId}.jsonl`);
    const bytes = writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    writeTranscript({
      directory: fixture.sourceSessionsPath,
      relativePath: path.join('2026', '10', '07', 'sibling.jsonl'),
      threadId: secondThreadId,
      cwd: '/workspace/project/feature-b',
    });
    writeFileSync(path.join(fixture.sourceSessionsPath, 'unknown.jsonl'), '{"type":"event_msg"}\n');
    writeTranscript({
      directory: fixture.sourceSessionsPath,
      relativePath: 'incomplete.jsonl',
      threadId: secondThreadId,
      complete: false,
    });

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(1);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(readFileSync(path.join(fixture.sessionHistoryPath, relativePath)).equals(bytes)).toBe(
      true
    );
    expect(existsSync(path.join(fixture.sessionHistoryPath, 'unknown.jsonl'))).toBe(false);
    expect(existsSync(path.join(fixture.sessionHistoryPath, 'incomplete.jsonl'))).toBe(false);
    expect(
      existsSync(path.join(fixture.sessionHistoryPath, '2026', '10', '07', 'sibling.jsonl'))
    ).toBe(false);
  });

  it('does not copy the same thread twice when the source repeats it under another filename', async () => {
    const fixture = createFixture();
    const firstPath = path.join('2026', '10', '07', `rollout-${firstThreadId}.jsonl`);
    const duplicatePath = path.join('2026', '10', '08', 'duplicate.jsonl');
    const bytes = writeTranscript({
      directory: fixture.sourceSessionsPath,
      relativePath: firstPath,
    });
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath: duplicatePath });

    const first = await importCodexExternalSessions({ ...fixture, worktreePath });
    const second = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(first.imported).toBe(1);
    expect(second).toEqual({ imported: 0, refreshed: 0, retryableFailures: 0 });
    expect(readFileSync(path.join(fixture.sessionHistoryPath, firstPath))).toEqual(bytes);
    expect(existsSync(path.join(fixture.sessionHistoryPath, duplicatePath))).toBe(false);
  });

  it('records versioned per-target provenance and refreshes an unchanged import after a complete source append', async () => {
    const fixture = createFixture();
    const relativePath = '2026/10/07/growing.jsonl';
    const original = writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const source = path.join(fixture.sourceSessionsPath, relativePath);
    const target = path.join(fixture.sessionHistoryPath, relativePath);

    expect((await importCodexExternalSessions({ ...fixture, worktreePath })).imported).toBe(1);
    const marker = JSON.parse(readFileSync(`${target}${provenanceSuffix}`, 'utf8')) as {
      version: number;
      sourceRoot: string;
      relativePath: string;
      threadId: string;
      sourceHash: string;
      targetHash: string;
    };
    expect(marker.version).toBe(1);
    expect(marker.sourceRoot).toBe(realpathSync(fixture.sourceSessionsPath));
    expect(marker.relativePath).toBe(relativePath);
    expect(marker.threadId).toBe(firstThreadId);
    expect(marker.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(marker.targetHash).toBe(marker.sourceHash);
    expect(readFileSync(target)).toEqual(original);

    appendTranscriptLine(source, 'Completed later');
    const second = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(second).toEqual({ imported: 0, refreshed: 1, retryableFailures: 0 });
    expect(readFileSync(target)).toEqual(readFileSync(source));
    const nextMarker = JSON.parse(readFileSync(`${target}${provenanceSuffix}`, 'utf8')) as {
      sourceHash: string;
      targetHash: string;
    };
    expect(nextMarker.sourceHash).not.toBe(marker.sourceHash);
    expect(nextMarker.targetHash).toBe(nextMarker.sourceHash);
  });

  it('skips copying a previously imported source with unchanged filesystem identity', async () => {
    const fixture = createFixture();
    const relativePath = 'unchanged-import.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    await importCodexExternalSessions({ ...fixture, worktreePath });
    const probe = await open(path.join(fixture.sessionHistoryPath, 'prototype-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe) as {
      writeFile(data: string | Buffer): Promise<void>;
    };
    await probe.close();
    const originalWrite = prototype.writeFile;
    let transcriptCopies = 0;
    vi.spyOn(prototype, 'writeFile').mockImplementation(function (this: FileHandle, data) {
      if (Buffer.isBuffer(data) && data.includes(Buffer.from('"type":"session_meta"'))) {
        transcriptCopies += 1;
      }
      return originalWrite.call(this, data);
    });

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result).toEqual({ imported: 0, refreshed: 0, retryableFailures: 0 });
    expect(transcriptCopies).toBe(0);
    expect(existsSync(`${target}${provenanceSuffix}`)).toBe(true);
  });

  it('refreshes the owned thread when a longer source with the same ID appears at a new filename', async () => {
    const fixture = createFixture();
    const firstPath = '2026/10/07/a-original.jsonl';
    const alternatePath = '2026/10/08/z-alternate.jsonl';
    const initial = writeTranscript({
      directory: fixture.sourceSessionsPath,
      relativePath: firstPath,
    });
    const target = path.join(fixture.sessionHistoryPath, firstPath);
    await importCodexExternalSessions({ ...fixture, worktreePath });
    mkdirSync(path.dirname(path.join(fixture.sourceSessionsPath, alternatePath)), {
      recursive: true,
    });
    writeFileSync(path.join(fixture.sourceSessionsPath, alternatePath), initial);
    appendTranscriptLine(
      path.join(fixture.sourceSessionsPath, alternatePath),
      'More from new path'
    );

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result).toEqual({ imported: 0, refreshed: 1, retryableFailures: 0 });
    expect(readFileSync(target)).toEqual(
      readFileSync(path.join(fixture.sourceSessionsPath, alternatePath))
    );
    expect(existsSync(path.join(fixture.sessionHistoryPath, alternatePath))).toBe(false);
    const marker = JSON.parse(readFileSync(`${target}${provenanceSuffix}`, 'utf8')) as {
      relativePath: string;
    };
    expect(marker.relativePath).toBe(alternatePath);
    expect(await importCodexExternalSessions({ ...fixture, worktreePath })).toEqual({
      imported: 0,
      refreshed: 0,
      retryableFailures: 0,
    });
  });

  it('does not refresh an imported target after a local append', async () => {
    const fixture = createFixture();
    const relativePath = 'locally-resumed.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const source = path.join(fixture.sourceSessionsPath, relativePath);
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    await importCodexExternalSessions({ ...fixture, worktreePath });
    appendTranscriptLine(target, 'Local resume');
    const localBytes = readFileSync(target);
    appendTranscriptLine(source, 'External resume');

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.refreshed).toBe(0);
    expect(readFileSync(target)).toEqual(localBytes);
  });

  it('does not refresh from a replacement source inode at the same relative path', async () => {
    const fixture = createFixture();
    const relativePath = 'replaced-external.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const source = path.join(fixture.sourceSessionsPath, relativePath);
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    await importCodexExternalSessions({ ...fixture, worktreePath });
    const original = readFileSync(target);
    const originalMarker = readFileSync(`${target}${provenanceSuffix}`);
    const originalSourceIdentity = statSync(source);
    const replacement = `${source}.replacement`;
    writeFileSync(replacement, original);
    appendTranscriptLine(replacement, 'New inode, same prefix');
    renameSync(replacement, source);
    expect(statSync(source).ino).not.toBe(originalSourceIdentity.ino);

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.refreshed).toBe(0);
    expect(readFileSync(target)).toEqual(original);
    expect(readFileSync(`${target}${provenanceSuffix}`)).toEqual(originalMarker);
  });

  it('never refreshes a pre-existing target without provenance even when source ID and filename match', async () => {
    const fixture = createFixture();
    const relativePath = 'unowned.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const original = writeTranscript({ directory: fixture.sessionHistoryPath, relativePath });
    appendTranscriptLine(path.join(fixture.sourceSessionsPath, relativePath), 'External addition');

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.refreshed).toBe(0);
    expect(readFileSync(path.join(fixture.sessionHistoryPath, relativePath))).toEqual(original);
    expect(
      existsSync(path.join(fixture.sessionHistoryPath, `${relativePath}${provenanceSuffix}`))
    ).toBe(false);
  });

  it('defers an incomplete external append without losing the last valid imported target', async () => {
    const fixture = createFixture();
    const relativePath = 'partial-append.jsonl';
    const original = writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    await importCodexExternalSessions({ ...fixture, worktreePath });
    appendFileSync(path.join(fixture.sourceSessionsPath, relativePath), '{"type":"event_msg"');

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.refreshed).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(readFileSync(target)).toEqual(original);
  });

  it('retries a failed sidecar write before publishing without leaving a target behind', async () => {
    const fixture = createFixture();
    const relativePath = 'before-sidecar.jsonl';
    const original = writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    const probe = await open(path.join(fixture.sessionHistoryPath, 'prototype-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe) as {
      writeFile(data: string | Buffer): Promise<void>;
    };
    await probe.close();
    const originalWrite = prototype.writeFile;
    const failingWrite = vi.spyOn(prototype, 'writeFile').mockImplementation(function (
      this: FileHandle,
      data
    ) {
      if (typeof data === 'string' && data.includes('"sourceHash"')) {
        throw new Error('Simulated sidecar write failure');
      }
      return originalWrite.call(this, data);
    });

    const first = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(first.imported).toBe(0);
    expect(first.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(`${target}${provenanceSuffix}`)).toBe(false);
    failingWrite.mockRestore();

    const second = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(second.imported).toBe(1);
    expect(readFileSync(target)).toEqual(original);
  });

  it('preserves a published target when sidecar publication fails and never claims it on retry', async () => {
    const fixture = createFixture();
    const relativePath = 'after-publication.jsonl';
    const original = writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    const probe = await open(path.join(fixture.sessionHistoryPath, 'prototype-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe) as {
      writeFile(data: string | Buffer): Promise<void>;
    };
    await probe.close();
    const originalWrite = prototype.writeFile;
    const sidecarConflict = vi.spyOn(prototype, 'writeFile').mockImplementation(function (
      this: FileHandle,
      data
    ) {
      if (typeof data === 'string' && data.includes('"sourceHash"')) {
        mkdirSync(`${target}${provenanceSuffix}`);
      }
      return originalWrite.call(this, data);
    });

    const first = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(readFileSync(target)).toEqual(original);
    expect(first.retryableFailures).toBeGreaterThan(0);
    sidecarConflict.mockRestore();
    rmSync(`${target}${provenanceSuffix}`, { recursive: true });
    appendTranscriptLine(path.join(fixture.sourceSessionsPath, relativePath), 'Later');

    const second = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(second.refreshed).toBe(0);
    expect(readFileSync(target)).toEqual(original);
    expect(existsSync(`${target}${provenanceSuffix}`)).toBe(false);

    writeTranscript({
      directory: fixture.sourceSessionsPath,
      relativePath: 'another-session.jsonl',
      threadId: secondThreadId,
    });
    const independent = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(independent.imported).toBe(1);
    expect(readFileSync(target)).toEqual(original);
  });

  it('ignores a malformed or symlinked provenance marker instead of overwriting the target', async () => {
    const fixture = createFixture();
    const relativePath = 'suspicious-sidecar.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const source = path.join(fixture.sourceSessionsPath, relativePath);
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    await importCodexExternalSessions({ ...fixture, worktreePath });
    writeFileSync(`${target}${provenanceSuffix}`, '{broken-json');
    const original = readFileSync(target);
    appendTranscriptLine(source, 'Untrusted external append');

    const first = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(first.refreshed).toBe(0);
    expect(readFileSync(target)).toEqual(original);

    rmSync(`${target}${provenanceSuffix}`);
    const unrelated = path.join(path.dirname(target), 'do-not-touch.json');
    writeFileSync(unrelated, '{"external":"unchanged"}');
    symlinkSync(unrelated, `${target}${provenanceSuffix}`);
    const second = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(second.refreshed).toBe(0);
    expect(readFileSync(target)).toEqual(original);
    expect(readFileSync(unrelated, 'utf8')).toBe('{"external":"unchanged"}');
  });

  it('does not replace an imported target that advances locally while a refresh is copied', async () => {
    const fixture = createFixture();
    const relativePath = 'raced-local-append.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    await importCodexExternalSessions({ ...fixture, worktreePath });
    appendTranscriptLine(path.join(fixture.sourceSessionsPath, relativePath), 'External append');

    const probe = await open(path.join(fixture.sessionHistoryPath, 'prototype-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe) as {
      writeFile(data: string | Buffer): Promise<void>;
    };
    await probe.close();
    const originalWrite = prototype.writeFile;
    let changed = false;
    const changingWrite = vi.spyOn(prototype, 'writeFile').mockImplementation(function (
      this: FileHandle,
      data
    ) {
      if (!changed && Buffer.isBuffer(data) && data.includes(Buffer.from('External append'))) {
        changed = true;
        appendTranscriptLine(target, 'Local append during copy');
      }
      return originalWrite.call(this, data);
    });

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(changed).toBe(true);
    expect(result.refreshed).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(readFileSync(target, 'utf8')).toContain('Local append during copy');
    changingWrite.mockRestore();
    expect((await importCodexExternalSessions({ ...fixture, worktreePath })).refreshed).toBe(0);
  });

  it('does not overwrite a locally replaced target path while hashing its old inode', async () => {
    const fixture = createFixture();
    const relativePath = 'replaced-during-hash.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const source = path.join(fixture.sourceSessionsPath, relativePath);
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    await importCodexExternalSessions({ ...fixture, worktreePath });
    appendTranscriptLine(source, 'External append');
    const originalIdentity = statSync(target);
    const userBytes = Buffer.concat([
      readFileSync(target),
      Buffer.from(
        `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'User replaced' } })}\n`
      ),
    ]);
    const probe = await open(path.join(fixture.sessionHistoryPath, 'prototype-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe) as Pick<FileHandle, 'createReadStream'>;
    await probe.close();
    const createReadStream = prototype.createReadStream;
    let targetHashReads = 0;
    vi.spyOn(prototype, 'createReadStream').mockImplementation(function (
      this: FileHandle,
      options
    ) {
      const opened = fstatSync(this.fd);
      if (opened.dev === originalIdentity.dev && opened.ino === originalIdentity.ino) {
        targetHashReads += 1;
        if (targetHashReads === 2) {
          renameSync(target, `${target}.old`);
          writeFileSync(target, userBytes);
        }
      }
      return createReadStream.call(this, options);
    });

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(targetHashReads).toBe(2);
    expect(result.refreshed).toBe(0);
    expect(readFileSync(target)).toEqual(userBytes);
  });

  it('defers a refresh while another process holds the workspace import transaction', async () => {
    const fixture = createFixture();
    const relativePath = 'cross-process-refresh.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const source = path.join(fixture.sourceSessionsPath, relativePath);
    const target = path.join(fixture.sessionHistoryPath, relativePath);
    await importCodexExternalSessions({ ...fixture, worktreePath });
    const original = readFileSync(target);
    appendTranscriptLine(source, 'New source record');
    const child = await startSqliteWriter(
      path.join(path.dirname(fixture.sessionHistoryPath), '.external-session-import.sqlite')
    );

    try {
      const deferred = await importCodexExternalSessions({ ...fixture, worktreePath });
      expect(deferred.refreshed).toBe(0);
      expect(deferred.retryableFailures).toBeGreaterThan(0);
      expect(readFileSync(target)).toEqual(original);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, 'exit');
        child.kill('SIGKILL');
        await stopped;
      }
    }

    const retry = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(retry.refreshed).toBe(1);
    expect(readFileSync(target)).toEqual(readFileSync(source));
  });

  it('never overwrites an existing target with a different thread ID at the same relative path', async () => {
    const fixture = createFixture();
    const relativePath = '2026/10/07/collision.jsonl';
    writeTranscript({
      directory: fixture.sourceSessionsPath,
      relativePath,
      threadId: firstThreadId,
    });
    const original = writeTranscript({
      directory: fixture.sessionHistoryPath,
      relativePath,
      threadId: secondThreadId,
    });

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(readFileSync(path.join(fixture.sessionHistoryPath, relativePath))).toEqual(original);
  });

  it('does not follow symlinked JSONL files or subdirectories, but accepts a symlinked source root', async () => {
    const fixture = createFixture();
    const externalFile = path.join(path.dirname(fixture.sourceSessionsPath), 'linked.jsonl');
    const linkedDirectory = path.join(path.dirname(fixture.sourceSessionsPath), 'linked-directory');
    const rootLink = path.join(path.dirname(fixture.sourceSessionsPath), 'sessions-link');
    writeTranscript({ directory: path.dirname(externalFile), relativePath: 'linked.jsonl' });
    writeTranscript({
      directory: linkedDirectory,
      relativePath: 'nested.jsonl',
      threadId: secondThreadId,
    });
    symlinkSync(externalFile, path.join(fixture.sourceSessionsPath, 'file.jsonl'));
    symlinkSync(linkedDirectory, path.join(fixture.sourceSessionsPath, 'directory'));
    symlinkSync(fixture.sourceSessionsPath, rootLink);
    const normalBytes = writeTranscript({
      directory: fixture.sourceSessionsPath,
      relativePath: 'regular.jsonl',
      threadId: 'c1a5678b-4af1-424d-89e5-bd8393acc2ae',
    });

    const result = await importCodexExternalSessions({
      ...fixture,
      sourceSessionsPath: rootLink,
      worktreePath,
    });

    expect(result.imported).toBe(1);
    expect(readFileSync(path.join(fixture.sessionHistoryPath, 'regular.jsonl'))).toEqual(
      normalBytes
    );
    expect(existsSync(path.join(fixture.sessionHistoryPath, 'file.jsonl'))).toBe(false);
    expect(existsSync(path.join(fixture.sessionHistoryPath, 'directory', 'nested.jsonl'))).toBe(
      false
    );
  });

  it('does not import its own worktree history when the source points inside the target', async () => {
    const fixture = createFixture();
    writeTranscript({ directory: fixture.sessionHistoryPath, relativePath: 'existing.jsonl' });

    const result = await importCodexExternalSessions({
      ...fixture,
      sourceSessionsPath: fixture.sessionHistoryPath,
      worktreePath,
    });

    expect(result).toEqual({ imported: 0, refreshed: 0, retryableFailures: 0 });
  });

  it('defers a completed-looking transcript with an invalid final JSONL record', async () => {
    const fixture = createFixture();
    writeTranscript({
      directory: fixture.sourceSessionsPath,
      relativePath: 'broken.jsonl',
      finalLine: '{bad-json}',
    });

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, 'broken.jsonl'))).toBe(false);
  });

  it('copies a multi-megabyte transcript in bounded chunks without reading it all at once', async () => {
    const fixture = createFixture();
    const relativePath = 'large-valid.jsonl';
    const bytes = writeTranscript({
      directory: fixture.sourceSessionsPath,
      relativePath,
      finalLine: JSON.stringify({
        type: 'event_msg',
        payload: { message: 'x'.repeat(4 * 1024 * 1024) },
      }),
    });
    const probe = await open(path.join(fixture.sessionHistoryPath, 'prototype-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe) as {
      writeFile(data: Buffer): Promise<void>;
      readFile(): Promise<Buffer>;
    };
    const originalWriteFile = prototype.writeFile;
    await probe.close();
    let largestWrite = 0;
    vi.spyOn(prototype, 'writeFile').mockImplementation(function (this: FileHandle, data) {
      largestWrite = Math.max(largestWrite, data.length);
      return originalWriteFile.call(this, data);
    });
    const readAll = vi.spyOn(prototype, 'readFile');

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(1);
    expect(largestWrite).toBeLessThanOrEqual(128 * 1024);
    expect(readAll).not.toHaveBeenCalled();
    expect(readFileSync(path.join(fixture.sessionHistoryPath, relativePath)).equals(bytes)).toBe(
      true
    );
  });

  it('defers a record over 64 MiB even when a valid later JSONL record follows', async () => {
    const fixture = createFixture();
    const relativePath = 'oversized-record.jsonl';
    const sourceFile = path.join(fixture.sourceSessionsPath, relativePath);
    writeFileSync(
      sourceFile,
      `${JSON.stringify({ type: 'session_meta', payload: { id: firstThreadId, cwd: worktreePath } })}\n{"type":"event_msg","payload":{"message":"`
    );
    const descriptor = openSync(sourceFile, 'a');
    try {
      const chunk = Buffer.alloc(128 * 1024, 'x');
      for (let index = 0; index < 513; index += 1) {
        writeSync(descriptor, chunk);
      }
      writeSync(descriptor, Buffer.from('"}}\n'));
    } finally {
      closeSync(descriptor);
    }

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);

    appendFileSync(sourceFile, '{"type":"event_msg","payload":{"message":"later"}}\n');
    const second = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(second.imported).toBe(0);
    expect(second.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);
  }, 20_000);

  it('rejects a transcript with truncated UTF-8 in the final JSON record', async () => {
    const fixture = createFixture();
    const relativePath = 'invalid-utf8.jsonl';
    const sourceFile = path.join(fixture.sourceSessionsPath, relativePath);
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    appendFileSync(
      sourceFile,
      Buffer.concat([
        Buffer.from('{"type":"event_msg","message":"'),
        Buffer.from([0xc3]),
        Buffer.from('"}\n'),
      ])
    );

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);
  });

  it('never publishes into a symlinked target ancestor outside the workspace history', async () => {
    const fixture = createFixture();
    const relativePath = path.join('2026', '10', '07', 'outside.jsonl');
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const outsideDirectory = path.join(path.dirname(fixture.sessionHistoryPath), 'outside');
    mkdirSync(outsideDirectory, { recursive: true });
    symlinkSync(outsideDirectory, path.join(fixture.sessionHistoryPath, '2026'));

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(outsideDirectory, '10', '07', 'outside.jsonl'))).toBe(false);
  });

  it('rejects a symlinked session history root instead of importing into a sibling worktree', async () => {
    const fixture = createFixture();
    const sibling = createFixture();
    const relativePath = 'sibling-leak.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const linkedHistoryPath = path.join(path.dirname(fixture.sessionHistoryPath), 'sessions-link');
    symlinkSync(sibling.sessionHistoryPath, linkedHistoryPath);

    const result = await importCodexExternalSessions({
      ...fixture,
      sessionHistoryPath: linkedHistoryPath,
      worktreePath,
    });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(sibling.sessionHistoryPath, relativePath))).toBe(false);
  });

  it('does not unlink unrelated files when a target ancestor changes during publication', async () => {
    const fixture = createFixture();
    const relativePath = path.join('2026', '10', '07', 'race.jsonl');
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const outsideDirectory = path.join(path.dirname(fixture.sessionHistoryPath), 'outside');
    mkdirSync(path.join(outsideDirectory, '10', '07'), { recursive: true });
    const probe = await open(path.join(fixture.sessionHistoryPath, 'prototype-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe) as { writeFile(data: Buffer): Promise<void> };
    const originalWriteFile = prototype.writeFile;
    await probe.close();
    let unrelatedFile = '';
    vi.spyOn(prototype, 'writeFile').mockImplementation(function (this: FileHandle, data) {
      if (!Buffer.isBuffer(data) || !data.includes(Buffer.from('"type":"session_meta"'))) {
        return originalWriteFile.call(this, data);
      }
      const yearDirectory = path.join(fixture.sessionHistoryPath, '2026');
      const importDirectory = path.join(yearDirectory, '10', '07');
      const temporaryName = readdirSync(importDirectory).find((name) => name.endsWith('.tmp'));
      if (!temporaryName) {
        throw new Error('Expected a temporary import file');
      }
      unrelatedFile = path.join(outsideDirectory, '10', '07', temporaryName);
      writeFileSync(unrelatedFile, 'unrelated data');
      renameSync(yearDirectory, path.join(fixture.sessionHistoryPath, '2026-before-switch'));
      symlinkSync(outsideDirectory, yearDirectory);
      return originalWriteFile.call(this, data);
    });

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(readFileSync(unrelatedFile, 'utf8')).toBe('unrelated data');
    expect(existsSync(path.join(outsideDirectory, '10', '07', 'race.jsonl'))).toBe(false);
  });

  it('does not import when the target history scan cannot rule out duplicate thread IDs', async () => {
    const fixture = createFixture();
    const relativePath = 'duplicate-from-source.jsonl';
    writeTranscript({ directory: fixture.sessionHistoryPath, relativePath: 'existing.jsonl' });
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    simulatedTargetScan.path = realpathSync(fixture.sessionHistoryPath);

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);
  });

  it('defers when a different process holds the workspace SQLite transaction', async () => {
    const fixture = createFixture();
    const relativePath = 'from-other-process.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const databasePath = path.join(
      path.dirname(fixture.sessionHistoryPath),
      '.external-session-import.sqlite'
    );
    const child = await startSqliteWriter(databasePath);

    try {
      const result = await importCodexExternalSessions({ ...fixture, worktreePath });
      expect(result.imported).toBe(0);
      expect(result.retryableFailures).toBeGreaterThan(0);
      expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, 'exit');
        child.kill('SIGKILL');
        await stopped;
      }
    }
  });

  it('retries immediately after a killed SQLite owner releases its transaction', async () => {
    const fixture = createFixture();
    const relativePath = 'retry-after-crash.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const databasePath = path.join(
      path.dirname(fixture.sessionHistoryPath),
      '.external-session-import.sqlite'
    );
    const child = await startSqliteWriter(databasePath);
    child.kill('SIGKILL');
    if (child.exitCode === null && child.signalCode === null) {
      await once(child, 'exit');
    }

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(1);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(true);
  });

  it('fails closed when the workspace SQLite mutex database is corrupt', async () => {
    const fixture = createFixture();
    const relativePath = 'corrupt-mutex-db.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const databasePath = path.join(
      path.dirname(fixture.sessionHistoryPath),
      '.external-session-import.sqlite'
    );
    writeFileSync(databasePath, 'not a SQLite database');

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);
  });

  it('defers on a transient SQLite transaction error and succeeds on retry', async () => {
    const fixture = createFixture();
    const relativePath = 'retry-after-sqlite-error.jsonl';
    const bytes = writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const exec = vi.spyOn(sqlite3.Database.prototype, 'exec').mockImplementationOnce(() => {
      throw new Error('Transient SQLite transaction failure');
    });

    const first = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(first.imported).toBe(0);
    expect(first.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);

    exec.mockRestore();
    const second = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(second.imported).toBe(1);
    expect(readFileSync(path.join(fixture.sessionHistoryPath, relativePath))).toEqual(bytes);
  });

  it('rejects a symlinked workspace SQLite mutex database', async () => {
    const fixture = createFixture();
    const sibling = createFixture();
    const relativePath = 'symlinked-mutex-db.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const databasePath = path.join(
      path.dirname(fixture.sessionHistoryPath),
      '.external-session-import.sqlite'
    );
    symlinkSync(
      path.join(path.dirname(sibling.sessionHistoryPath), 'sibling-db.sqlite'),
      databasePath
    );

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);
    expect(
      existsSync(path.join(path.dirname(sibling.sessionHistoryPath), 'sibling-db.sqlite'))
    ).toBe(false);
  });

  it('serializes concurrent imports across the complete thread-ID scan and publication', async () => {
    const fixture = createFixture();
    const firstPath = '2026/10/07/first.jsonl';
    const duplicatePath = '2026/10/08/duplicate.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath: firstPath });
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath: duplicatePath });
    const probe = await open(path.join(fixture.sessionHistoryPath, 'prototype-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe) as { writeFile(data: Buffer): Promise<void> };
    const originalWriteFile = prototype.writeFile;
    await probe.close();
    let resumeFirstWrite: (() => void) | undefined;
    let blockedOnce = false;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      vi.spyOn(prototype, 'writeFile').mockImplementation(async function (this: FileHandle, data) {
        if (
          !blockedOnce &&
          Buffer.isBuffer(data) &&
          data.includes(Buffer.from('"type":"session_meta"'))
        ) {
          blockedOnce = true;
          resolve();
          await new Promise<void>((resume) => {
            resumeFirstWrite = resume;
          });
        }
        await originalWriteFile.call(this, data);
      });
    });

    const firstImport = importCodexExternalSessions({ ...fixture, worktreePath });
    await firstWriteBlocked;
    let second: Awaited<ReturnType<typeof importCodexExternalSessions>>;
    try {
      second = await importCodexExternalSessions({ ...fixture, worktreePath });
    } finally {
      resumeFirstWrite?.();
    }
    const first = await firstImport;

    expect(second.imported).toBe(0);
    expect(second.retryableFailures).toBeGreaterThan(0);
    expect(first.imported).toBe(1);
    expect(existsSync(path.join(fixture.sessionHistoryPath, firstPath))).toBe(true);
    expect(existsSync(path.join(fixture.sessionHistoryPath, duplicatePath))).toBe(false);
  });

  it('defers imports while any existing target transcript has unknown metadata', async () => {
    const fixture = createFixture();
    const relativePath = 'matching-new.jsonl';
    const unreadable = path.join(fixture.sessionHistoryPath, 'unclassified.jsonl');
    writeFileSync(unreadable, '{"type":"event_msg"}\n');
    const bytes = writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });

    const first = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(first.imported).toBe(0);
    expect(first.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);

    writeTranscript({
      directory: fixture.sessionHistoryPath,
      relativePath: 'unclassified.jsonl',
      threadId: secondThreadId,
    });
    const second = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(second.imported).toBe(1);
    expect(readFileSync(path.join(fixture.sessionHistoryPath, relativePath))).toEqual(bytes);
  });

  it('does not publish a source that changes while being copied and retries on the next pass', async () => {
    const fixture = createFixture();
    const relativePath = '2026/10/07/active.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const sourceFile = path.join(fixture.sourceSessionsPath, relativePath);
    const probe = await open(path.join(fixture.sessionHistoryPath, 'prototype-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe) as { writeFile(data: Buffer): Promise<void> };
    const originalWriteFile = prototype.writeFile;
    await probe.close();
    const spy = vi.spyOn(prototype, 'writeFile').mockImplementation(function (
      this: FileHandle,
      data
    ) {
      if (!Buffer.isBuffer(data) || !data.includes(Buffer.from('"type":"session_meta"'))) {
        return originalWriteFile.call(this, data);
      }
      appendFileSync(
        sourceFile,
        `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Later' } })}\n`
      );
      return originalWriteFile.call(this, data);
    });

    const first = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(
      spy.mock.calls.filter(
        ([data]) => Buffer.isBuffer(data) && data.includes(Buffer.from('"type":"session_meta"'))
      )
    ).toHaveLength(1);
    expect(first.imported).toBe(0);
    expect(first.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);

    spy.mockRestore();
    const second = await importCodexExternalSessions({ ...fixture, worktreePath });
    expect(second.imported).toBe(1);
    expect(readFileSync(path.join(fixture.sessionHistoryPath, relativePath))).toEqual(
      readFileSync(path.join(fixture.sourceSessionsPath, relativePath))
    );
  });
});
