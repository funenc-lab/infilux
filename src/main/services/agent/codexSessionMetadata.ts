import type { Dirent, Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeFileLineReader, createFileLineReader } from './fileLineReader';

export const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

export interface CodexSessionMeta {
  threadId: string;
  timestampMs: number;
  cwd?: string;
  parentThreadId?: string;
  agentType?: string;
  agentNickname?: string;
}

export interface CodexSessionMetaRecord {
  filePath: string;
  fileMtimeMs: number;
  meta: CodexSessionMeta;
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseCodexTimestamp(value: unknown): number {
  if (typeof value !== 'string') {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatCodexAgentType(agentType?: string): string {
  if (!agentType) {
    return 'Subagent';
  }

  return agentType
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function extractCodexSessionMeta(rawLine: string): CodexSessionMeta | null {
  const parsed = safeJsonParse(rawLine.trim());
  if (!parsed || parsed.type !== 'session_meta') {
    return null;
  }

  const payload = parsed.payload;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const typedPayload = payload as Record<string, unknown>;
  const threadId = typedPayload.id;
  if (typeof threadId !== 'string') {
    return null;
  }

  const source = typedPayload.source;
  const threadSpawn =
    source && typeof source === 'object'
      ? ((source as Record<string, unknown>).subagent as Record<string, unknown> | undefined)
          ?.thread_spawn
      : undefined;
  const typedThreadSpawn =
    threadSpawn && typeof threadSpawn === 'object'
      ? (threadSpawn as Record<string, unknown>)
      : undefined;

  return {
    threadId,
    timestampMs: parseCodexTimestamp(typedPayload.timestamp),
    cwd: typeof typedPayload.cwd === 'string' ? typedPayload.cwd : undefined,
    parentThreadId:
      typeof typedThreadSpawn?.parent_thread_id === 'string'
        ? typedThreadSpawn.parent_thread_id
        : undefined,
    agentType:
      typeof typedPayload.agent_role === 'string'
        ? typedPayload.agent_role
        : typeof typedThreadSpawn?.agent_role === 'string'
          ? typedThreadSpawn.agent_role
          : undefined,
    agentNickname:
      typeof typedPayload.agent_nickname === 'string'
        ? typedPayload.agent_nickname
        : typeof typedThreadSpawn?.agent_nickname === 'string'
          ? typedThreadSpawn.agent_nickname
          : undefined,
  };
}

export async function readCodexSessionMeta(filePath: string): Promise<CodexSessionMeta | null> {
  const reader = createFileLineReader(filePath);

  try {
    for await (const rawLine of reader.lineReader) {
      const parsed = extractCodexSessionMeta(rawLine);
      if (parsed) {
        return parsed;
      }
    }
  } finally {
    await closeFileLineReader(reader);
  }

  return null;
}

function formatSessionDatePathSegment(value: number): string {
  return String(value).padStart(2, '0');
}

function buildSessionDateDirectories(rootDir: string, startMs: number, endMs: number): string[] {
  if (startMs > endMs) {
    return [];
  }

  const directories: string[] = [];
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endMs);
  end.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    directories.push(
      path.join(
        rootDir,
        String(cursor.getFullYear()),
        formatSessionDatePathSegment(cursor.getMonth() + 1),
        formatSessionDatePathSegment(cursor.getDate())
      )
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  return directories;
}

async function collectCodexSessionFiles(
  dirPath: string,
  startMs: number,
  endMs: number,
  files: Array<{ filePath: string; fileStat: Stats }>
): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await readdir(dirPath, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await collectCodexSessionFiles(fullPath, startMs, endMs, files);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
      continue;
    }

    let fileStat: Stats;
    try {
      fileStat = await stat(fullPath);
    } catch {
      continue;
    }

    const fileMtimeMs = Math.floor(fileStat.mtimeMs);
    if (fileMtimeMs < startMs || fileMtimeMs > endMs) {
      continue;
    }

    files.push({
      filePath: fullPath,
      fileStat,
    });
  }
}

export async function readCodexSessionMetaRecords(
  rootDir: string,
  startMs: number,
  endMs = Date.now()
): Promise<CodexSessionMetaRecord[]> {
  if (startMs > endMs) {
    return [];
  }

  const candidateFiles: Array<{ filePath: string; fileStat: Stats }> = [];
  const candidateDirs = buildSessionDateDirectories(rootDir, startMs, endMs);

  for (const candidateDir of candidateDirs) {
    await collectCodexSessionFiles(candidateDir, startMs, endMs, candidateFiles);
  }

  const records: CodexSessionMetaRecord[] = [];

  for (const candidate of candidateFiles) {
    const meta = await readCodexSessionMeta(candidate.filePath);
    if (!meta) {
      continue;
    }

    if (meta.timestampMs > 0 && (meta.timestampMs < startMs || meta.timestampMs > endMs)) {
      continue;
    }

    records.push({
      filePath: candidate.filePath,
      fileMtimeMs: candidate.fileStat.mtimeMs,
      meta,
    });
  }

  records.sort((left, right) => {
    const leftTimestamp = resolveCodexSessionMetaTimestamp(left);
    const rightTimestamp = resolveCodexSessionMetaTimestamp(right);

    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }

    return left.meta.threadId.localeCompare(right.meta.threadId);
  });

  return records;
}

export function resolveCodexSessionMetaTimestamp(record: CodexSessionMetaRecord): number {
  return record.meta.timestampMs > 0 ? record.meta.timestampMs : record.fileMtimeMs;
}

export async function findCodexSessionFileByThreadId(
  rootDir: string,
  threadId: string
): Promise<string | null> {
  try {
    const entries = await readdir(rootDir, { withFileTypes: true, encoding: 'utf8' });

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);

      if (entry.isDirectory()) {
        const nested = await findCodexSessionFileByThreadId(fullPath, threadId);
        if (nested) {
          return nested;
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(threadId)) {
        return fullPath;
      }
    }
  } catch {
    return null;
  }

  return null;
}
