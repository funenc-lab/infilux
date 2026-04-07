import { createReadStream } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type {
  ResolveAgentProviderSessionRequest,
  ResolveAgentProviderSessionResult,
} from '@shared/types';

const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const MAX_SESSION_FILES_PER_LOOKUP = 64;
const SESSION_DISCOVERY_CLOCK_SKEW_MS = 5_000;
const SESSION_DISCOVERY_MAX_START_AGE_MS = 2 * 60_000;

interface CodexSessionMeta {
  threadId: string;
  cwd: string;
  startedAt: number;
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string') {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function startOfLocalDay(timestamp: number): Date {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDayDirectory(date: Date): string {
  return path.join(
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  );
}

function listCandidateDayDirectories(fromMs: number, toMs: number): string[] {
  const startDay = startOfLocalDay(fromMs);
  const endDay = startOfLocalDay(toMs);
  const results: string[] = [];
  const cursor = new Date(startDay);

  while (cursor.getTime() <= endDay.getTime()) {
    results.push(formatDayDirectory(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return results;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readCodexSessionMeta(filePath: string): Promise<CodexSessionMeta | null> {
  const lineReader = readline.createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  try {
    for await (const rawLine of lineReader) {
      const parsed = safeJsonParse(rawLine.trim());
      if (!parsed || parsed.type !== 'session_meta' || !parsed.payload) {
        continue;
      }

      const payload = parsed.payload as Record<string, unknown>;
      const threadId = typeof payload.id === 'string' ? payload.id : '';
      const cwd = typeof payload.cwd === 'string' ? payload.cwd : '';
      const startedAt = parseTimestamp(payload.timestamp) || parseTimestamp(parsed.timestamp);

      if (!threadId || !cwd || startedAt <= 0) {
        return null;
      }

      return {
        threadId,
        cwd,
        startedAt,
      };
    }
  } finally {
    lineReader.close();
  }

  return null;
}

async function listCandidateSessionFiles(
  sessionsDir: string,
  fromMs: number,
  toMs: number
): Promise<string[]> {
  const dayDirectories = listCandidateDayDirectories(fromMs, toMs);
  const files: string[] = [];

  for (const dayDirectory of dayDirectories) {
    const fullDayPath = path.join(sessionsDir, dayDirectory);
    if (!(await pathExists(fullDayPath))) {
      continue;
    }

    const entries = await readdir(fullDayPath, { withFileTypes: true, encoding: 'utf8' });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
        continue;
      }
      files.push(path.join(fullDayPath, entry.name));
    }
  }

  files.sort((left, right) => right.localeCompare(left));
  return files.slice(0, MAX_SESSION_FILES_PER_LOOKUP);
}

function isCodexAgentCommand(agentCommand: string): boolean {
  return agentCommand === 'codex';
}

export class AgentProviderSessionService {
  constructor(private readonly codexSessionsDir = CODEX_SESSIONS_DIR) {}

  async resolveProviderSession(
    request: ResolveAgentProviderSessionRequest
  ): Promise<ResolveAgentProviderSessionResult> {
    if (!isCodexAgentCommand(request.agentCommand)) {
      return { providerSessionId: null };
    }

    const earliestStartedAt = Math.max(
      request.createdAt - SESSION_DISCOVERY_CLOCK_SKEW_MS,
      request.observedAt - SESSION_DISCOVERY_MAX_START_AGE_MS
    );
    const latestStartedAt = request.observedAt + SESSION_DISCOVERY_CLOCK_SKEW_MS;
    const candidateFiles = await listCandidateSessionFiles(
      this.codexSessionsDir,
      earliestStartedAt,
      latestStartedAt
    );

    const matches: CodexSessionMeta[] = [];
    for (const filePath of candidateFiles) {
      const sessionMeta = await readCodexSessionMeta(filePath);
      if (!sessionMeta || sessionMeta.cwd !== request.cwd) {
        continue;
      }
      if (sessionMeta.startedAt < earliestStartedAt || sessionMeta.startedAt > latestStartedAt) {
        continue;
      }
      matches.push(sessionMeta);
    }

    matches.sort((left, right) => {
      const leftDistance = Math.abs(left.startedAt - request.observedAt);
      const rightDistance = Math.abs(right.startedAt - request.observedAt);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return right.startedAt - left.startedAt;
    });

    return {
      providerSessionId: matches[0]?.threadId ?? null,
    };
  }
}

export const agentProviderSessionService = new AgentProviderSessionService();
