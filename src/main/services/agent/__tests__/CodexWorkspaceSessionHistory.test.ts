import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  migrateCodexWorkspaceSessionHistory,
  resolveCodexWorkspaceSessionHistoryPath,
} from '../CodexWorkspaceSessionHistory';

const tempDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'infilux-codex-workspace-history-'));
  tempDirectories.push(directory);
  return directory;
}

function writeSessionFile(options: { root: string; threadId: string; cwd: string }): string {
  const relativePath = path.join('2026', '08', '20', `rollout-${options.threadId}.jsonl`);
  const filePath = path.join(options.root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify({
      type: 'session_meta',
      payload: { id: options.threadId, cwd: options.cwd },
    })}\n`,
    'utf8'
  );
  return relativePath;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('resolveCodexWorkspaceSessionHistoryPath', () => {
  it('uses one stable history directory for the same repository worktree', () => {
    const historyRoot = path.join('/runtime', 'codex-session-histories');
    const scope = {
      repoPath: '/workspace/infilux',
      worktreePath: '/workspace/infilux-worktrees/feature-a',
    };

    const first = resolveCodexWorkspaceSessionHistoryPath({ historyRoot, ...scope });
    const second = resolveCodexWorkspaceSessionHistoryPath({ historyRoot, ...scope });

    expect(first).toBe(second);
    expect(first).toMatch(/^\/runtime\/codex-session-histories\/workspace-[a-f0-9]{32}\/sessions$/);
  });

  it('separates histories for sibling worktrees in the same repository', () => {
    const historyRoot = path.join('/runtime', 'codex-session-histories');
    const repoPath = '/workspace/infilux';

    const featureA = resolveCodexWorkspaceSessionHistoryPath({
      historyRoot,
      repoPath,
      worktreePath: '/workspace/infilux-worktrees/feature-a',
    });
    const featureB = resolveCodexWorkspaceSessionHistoryPath({
      historyRoot,
      repoPath,
      worktreePath: '/workspace/infilux-worktrees/feature-b',
    });

    expect(featureA).not.toBe(featureB);
  });

  it('uses the same directory for relative and absolute local worktree paths', () => {
    const historyRoot = path.join('/runtime', 'codex-session-histories');
    const absoluteWorktreePath = path.join(process.cwd(), 'test-worktrees', 'feature-a');
    const relativeWorktreePath = path.relative(process.cwd(), absoluteWorktreePath);

    const fromAbsolutePath = resolveCodexWorkspaceSessionHistoryPath({
      historyRoot,
      worktreePath: absoluteWorktreePath,
    });
    const fromRelativePath = resolveCodexWorkspaceSessionHistoryPath({
      historyRoot,
      worktreePath: relativeWorktreePath,
    });

    expect(fromRelativePath).toBe(fromAbsolutePath);
  });

  it('requires an explicit worktree path instead of falling back to the repository root', () => {
    expect(() =>
      resolveCodexWorkspaceSessionHistoryPath({
        historyRoot: '/runtime/codex-session-histories',
        repoPath: '/workspace/infilux',
      })
    ).toThrow('Codex session history requires a worktree path');
  });

  it('imports only legacy sessions owned by the worktree', async () => {
    const legacySessionsPath = createTempDirectory();
    const historyRoot = createTempDirectory();
    const worktreePath = '/workspace/infilux-worktrees/feature-a';
    const matchingRelativePath = writeSessionFile({
      root: legacySessionsPath,
      threadId: 'feature-a-session',
      cwd: worktreePath,
    });
    const siblingRelativePath = writeSessionFile({
      root: legacySessionsPath,
      threadId: 'feature-b-session',
      cwd: '/workspace/infilux-worktrees/feature-b',
    });
    const sessionHistoryPath = resolveCodexWorkspaceSessionHistoryPath({
      historyRoot,
      repoPath: '/workspace/infilux',
      worktreePath,
    });

    await migrateCodexWorkspaceSessionHistory({
      sessionHistoryPath,
      sourceSessionsPaths: [legacySessionsPath],
      worktreePath,
    });

    expect(readFileSync(path.join(sessionHistoryPath, matchingRelativePath), 'utf8')).toContain(
      'feature-a-session'
    );
    expect(existsSync(path.join(sessionHistoryPath, siblingRelativePath))).toBe(false);
  });

  it('leaves migration retryable when a legacy session cannot be classified', async () => {
    const legacySessionsPath = createTempDirectory();
    const historyRoot = createTempDirectory();
    const worktreePath = '/workspace/infilux-worktrees/feature-a';
    const relativePath = path.join('2026', '08', '20', 'recoverable.jsonl');
    const sourceFilePath = path.join(legacySessionsPath, relativePath);
    const sessionHistoryPath = resolveCodexWorkspaceSessionHistoryPath({
      historyRoot,
      worktreePath,
    });
    mkdirSync(path.dirname(sourceFilePath), { recursive: true });
    writeFileSync(sourceFilePath, '{not-json}\n', 'utf8');

    await migrateCodexWorkspaceSessionHistory({
      sessionHistoryPath,
      sourceSessionsPaths: [legacySessionsPath],
      worktreePath,
    });

    expect(
      existsSync(path.join(path.dirname(sessionHistoryPath), '.legacy-session-history-migrated-v1'))
    ).toBe(false);

    writeFileSync(
      sourceFilePath,
      `${JSON.stringify({
        type: 'session_meta',
        payload: { id: 'recoverable', cwd: worktreePath },
      })}\n`,
      'utf8'
    );

    await migrateCodexWorkspaceSessionHistory({
      sessionHistoryPath,
      sourceSessionsPaths: [legacySessionsPath],
      worktreePath,
    });

    expect(readFileSync(path.join(sessionHistoryPath, relativePath), 'utf8')).toContain(
      'recoverable'
    );
  });
});
