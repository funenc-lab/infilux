import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

  it('defers a single JSONL record over the 64 MiB last-line memory budget', async () => {
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

  it('defers when a different process holds the workspace import lock', async () => {
    const fixture = createFixture();
    const relativePath = 'from-other-process.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const lockPath = path.join(
      path.dirname(fixture.sessionHistoryPath),
      '.external-session-import.lock'
    );
    const child = spawn(
      process.execPath,
      [
        '-e',
        [
          "const fs = require('node:fs');",
          'const lockPath = process.argv[1];',
          "fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, token: 'other-process', createdAt: Date.now() }), { flag: 'wx' });",
          "process.stdout.write('locked\\n');",
          "process.stdin.on('end', () => fs.unlinkSync(lockPath));",
          'process.stdin.resume();',
        ].join('\n'),
        lockPath,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    try {
      await once(child.stdout, 'data');
      const result = await importCodexExternalSessions({ ...fixture, worktreePath });
      expect(result.imported).toBe(0);
      expect(result.retryableFailures).toBeGreaterThan(0);
      expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(false);
    } finally {
      child.stdin.end();
      if (child.exitCode === null) {
        await once(child, 'exit');
      }
    }
  });

  it('recovers an old lock only when its owner is confirmed dead', async () => {
    const fixture = createFixture();
    const relativePath = 'retry-after-crash.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const lockPath = path.join(
      path.dirname(fixture.sessionHistoryPath),
      '.external-session-import.lock'
    );
    const oldTimestamp = Date.now() - 20 * 60 * 1_000;
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 2_147_483_647, token: firstThreadId, createdAt: oldTimestamp })
    );
    utimesSync(lockPath, new Date(oldTimestamp), new Date(oldTimestamp));

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(1);
    expect(existsSync(path.join(fixture.sessionHistoryPath, relativePath))).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('does not steal an old import lock while its owner process is still alive', async () => {
    const fixture = createFixture();
    const relativePath = 'alive-lock-owner.jsonl';
    writeTranscript({ directory: fixture.sourceSessionsPath, relativePath });
    const lockPath = path.join(
      path.dirname(fixture.sessionHistoryPath),
      '.external-session-import.lock'
    );
    const oldTimestamp = Date.now() - 20 * 60 * 1_000;
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, token: firstThreadId, createdAt: oldTimestamp })
    );
    utimesSync(lockPath, new Date(oldTimestamp), new Date(oldTimestamp));

    const result = await importCodexExternalSessions({ ...fixture, worktreePath });

    expect(result.imported).toBe(0);
    expect(result.retryableFailures).toBeGreaterThan(0);
    expect(existsSync(lockPath)).toBe(true);
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
