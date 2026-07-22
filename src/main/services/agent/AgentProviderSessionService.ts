import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  ReadAgentProviderSessionTitleRequest,
  ReadAgentProviderSessionTitleResult,
  ResolveAgentProviderSessionRequest,
  ResolveAgentProviderSessionResult,
} from '@shared/types';
import { normalizeAgentSessionTitleText } from '@shared/utils/agentSessionTitle';
import { resolveCodexSessionsDir } from './CodexHomePaths';
import { findCodexSessionFileByThreadId } from './codexSessionMetadata';
import { closeFileLineReader, createFileLineReader } from './fileLineReader';

const SESSION_DISCOVERY_CLOCK_SKEW_MS = 5_000;
const SESSION_DISCOVERY_MAX_START_AGE_MS = 2 * 60_000;
type CodexSessionsDirProvider = string | (() => string);

interface CodexSessionMeta {
  threadId: string;
  cwd: string;
  startedAt: number;
}

interface SessionDiscoveryWindow {
  earliestStartedAt: number;
  latestStartedAt: number;
  sortTargetAt: number;
}

interface PendingSessionDiscovery {
  cwd: string;
  createdAt: number;
  earliestStartedAt: number;
  latestStartedAt: number;
  token: symbol;
  requiresBatch: boolean;
}

type ConcurrentClaimResult = 'not-concurrent' | 'waiting' | 'assigned';

interface CodexTranscriptContentPart {
  type?: string;
  text?: string;
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
  const reader = createFileLineReader(filePath);

  try {
    for await (const rawLine of reader.lineReader) {
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
    await closeFileLineReader(reader);
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
  return files;
}

function isCodexAgentCommand(agentCommand: string): boolean {
  return agentCommand === 'codex';
}

function extractCodexMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .flatMap((part) => {
      if (!part || typeof part !== 'object') {
        return [];
      }

      const typedPart = part as CodexTranscriptContentPart;
      if (
        (typedPart.type === 'input_text' || typedPart.type === 'output_text') &&
        typeof typedPart.text === 'string'
      ) {
        return [typedPart.text.trim()];
      }

      return [];
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function isCodexBootstrapTranscriptText(text: string): boolean {
  const trimmedText = text.trim();
  const isAgentInstructions =
    /^# AGENTS\.md instructions(?: for [^\n]+)?\s*\n+<INSTRUCTIONS>[\s\S]*<\/INSTRUCTIONS>(?:\s*<environment_context>[\s\S]*<\/environment_context>)?\s*$/u.test(
      trimmedText
    );
  const isEnvironmentContext =
    trimmedText.startsWith('<environment_context>') &&
    trimmedText.endsWith('</environment_context>');

  return isAgentInstructions || isEnvironmentContext;
}

async function readCodexFirstUserMessage(filePath: string): Promise<string | null> {
  const reader = createFileLineReader(filePath);
  let taskStarted = false;

  try {
    for await (const rawLine of reader.lineReader) {
      const parsed = safeJsonParse(rawLine.trim());
      if (!parsed) {
        continue;
      }

      if (parsed.type === 'event_msg' && parsed.payload && typeof parsed.payload === 'object') {
        const payload = parsed.payload as Record<string, unknown>;
        if (payload.type === 'task_started') {
          taskStarted = true;
        }
        continue;
      }

      if (
        !taskStarted ||
        parsed.type !== 'response_item' ||
        !parsed.payload ||
        typeof parsed.payload !== 'object'
      ) {
        continue;
      }

      const payload = parsed.payload as Record<string, unknown>;
      if (payload.type !== 'message' || payload.role !== 'user') {
        continue;
      }

      const text = extractCodexMessageText(payload.content);
      if (!text || isCodexBootstrapTranscriptText(text)) {
        continue;
      }

      const title = normalizeAgentSessionTitleText(text);
      if (title) {
        return title;
      }
    }
  } finally {
    await closeFileLineReader(reader);
  }

  return null;
}

function createCodexSessionsDirResolver(provider: CodexSessionsDirProvider): () => string {
  if (typeof provider === 'string') {
    return () => provider;
  }
  return provider;
}

function resolveSessionDiscoveryWindow(
  request: ResolveAgentProviderSessionRequest
): SessionDiscoveryWindow {
  const startupWindowEndsAt = request.createdAt + SESSION_DISCOVERY_MAX_START_AGE_MS;
  const isDelayedRecoveryLookup = request.observedAt > startupWindowEndsAt;

  if (isDelayedRecoveryLookup) {
    return {
      earliestStartedAt: Math.max(0, request.createdAt - SESSION_DISCOVERY_CLOCK_SKEW_MS),
      latestStartedAt: startupWindowEndsAt,
      sortTargetAt: request.createdAt,
    };
  }

  return {
    earliestStartedAt: Math.max(
      0,
      request.createdAt - SESSION_DISCOVERY_CLOCK_SKEW_MS,
      request.observedAt - SESSION_DISCOVERY_MAX_START_AGE_MS
    ),
    latestStartedAt: request.observedAt + SESSION_DISCOVERY_CLOCK_SKEW_MS,
    sortTargetAt: request.observedAt,
  };
}

function discoveryWindowsOverlap(
  left: Pick<SessionDiscoveryWindow, 'earliestStartedAt' | 'latestStartedAt'>,
  right: Pick<SessionDiscoveryWindow, 'earliestStartedAt' | 'latestStartedAt'>
): boolean {
  return (
    Math.max(left.earliestStartedAt, right.earliestStartedAt) <=
    Math.min(left.latestStartedAt, right.latestStartedAt)
  );
}

function isSessionWithinDiscoveryWindow(
  session: CodexSessionMeta,
  discovery: PendingSessionDiscovery
): boolean {
  return (
    session.startedAt >= discovery.earliestStartedAt &&
    session.startedAt <= discovery.latestStartedAt
  );
}

export class AgentProviderSessionService {
  private readonly pendingSessionMetaReads = new Map<string, Promise<CodexSessionMeta | null>>();
  private readonly pendingSessionTitleReads = new Map<string, Promise<string | null>>();
  private readonly providerSessionIdByUiSessionId = new Map<string, string>();
  private readonly uiSessionIdByProviderSessionId = new Map<string, string>();
  private readonly pendingDiscoveryByUiSessionId = new Map<string, PendingSessionDiscovery>();
  private readonly activeResolutionTokenByUiSessionId = new Map<string, symbol>();
  private readonly resolveCodexSessionsDir: () => string;

  constructor(codexSessionsDir: CodexSessionsDirProvider = resolveCodexSessionsDir) {
    this.resolveCodexSessionsDir = createCodexSessionsDirResolver(codexSessionsDir);
  }

  async resolveProviderSession(
    request: ResolveAgentProviderSessionRequest
  ): Promise<ResolveAgentProviderSessionResult> {
    if (!isCodexAgentCommand(request.agentCommand)) {
      return { providerSessionId: null };
    }

    const requestedProviderSessionId = request.providerSessionId?.trim();
    const claimedProviderSessionId = request.uiSessionId
      ? this.providerSessionIdByUiSessionId.get(request.uiSessionId)
      : undefined;
    if (claimedProviderSessionId) {
      return {
        providerSessionId:
          !requestedProviderSessionId || requestedProviderSessionId === claimedProviderSessionId
            ? claimedProviderSessionId
            : null,
      };
    }

    const resolutionToken = request.uiSessionId ? Symbol(request.uiSessionId) : undefined;
    const discoveryWindow = requestedProviderSessionId
      ? undefined
      : resolveSessionDiscoveryWindow(request);
    if (request.uiSessionId && resolutionToken) {
      this.activeResolutionTokenByUiSessionId.set(request.uiSessionId, resolutionToken);
      if (discoveryWindow) {
        const concurrentDiscoveries = Array.from(this.pendingDiscoveryByUiSessionId.entries())
          .filter(
            ([uiSessionId, discovery]) =>
              discovery.cwd === request.cwd &&
              discoveryWindowsOverlap(discovery, discoveryWindow) &&
              this.isResolutionActiveForToken(uiSessionId, discovery.token)
          )
          .map(([, discovery]) => discovery);
        const requiresBatch = concurrentDiscoveries.length > 0;
        for (const discovery of concurrentDiscoveries) {
          discovery.requiresBatch = true;
        }
        this.pendingDiscoveryByUiSessionId.set(request.uiSessionId, {
          cwd: request.cwd,
          createdAt: request.createdAt,
          earliestStartedAt: discoveryWindow.earliestStartedAt,
          latestStartedAt: discoveryWindow.latestStartedAt,
          token: resolutionToken,
          requiresBatch,
        });
      }
    }

    try {
      if (requestedProviderSessionId) {
        const sessionFile = await findCodexSessionFileByThreadId(
          this.resolveCodexSessionsDir(),
          requestedProviderSessionId
        );
        if (!this.isResolutionActiveForToken(request.uiSessionId, resolutionToken)) {
          return { providerSessionId: null };
        }
        if (sessionFile) {
          const sessionMeta = await this.readCodexSessionMeta(sessionFile);
          if (!this.isResolutionActiveForToken(request.uiSessionId, resolutionToken)) {
            return { providerSessionId: null };
          }
          if (
            sessionMeta?.cwd === request.cwd &&
            this.claimProviderSession(request.uiSessionId, requestedProviderSessionId)
          ) {
            return { providerSessionId: requestedProviderSessionId };
          }
        }
        return { providerSessionId: null };
      }

      const { earliestStartedAt, latestStartedAt, sortTargetAt } =
        discoveryWindow ?? resolveSessionDiscoveryWindow(request);
      const codexSessionsDir = this.resolveCodexSessionsDir();
      const candidateFiles = await listCandidateSessionFiles(
        codexSessionsDir,
        earliestStartedAt,
        latestStartedAt
      );
      if (!this.isResolutionActiveForToken(request.uiSessionId, resolutionToken)) {
        return { providerSessionId: null };
      }

      const matches: CodexSessionMeta[] = [];
      for (const filePath of candidateFiles) {
        const sessionMeta = await this.readCodexSessionMeta(filePath);
        if (!this.isResolutionActiveForToken(request.uiSessionId, resolutionToken)) {
          return { providerSessionId: null };
        }
        if (!sessionMeta || sessionMeta.cwd !== request.cwd) {
          continue;
        }
        if (sessionMeta.startedAt < earliestStartedAt || sessionMeta.startedAt > latestStartedAt) {
          continue;
        }
        matches.push(sessionMeta);
      }

      matches.sort((left, right) => {
        const leftDistance = Math.abs(left.startedAt - sortTargetAt);
        const rightDistance = Math.abs(right.startedAt - sortTargetAt);
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }
        return right.startedAt - left.startedAt;
      });

      if (!request.uiSessionId) {
        return { providerSessionId: matches[0]?.threadId ?? null };
      }

      const concurrentClaimResult = this.claimConcurrentProviderSessions(
        request.uiSessionId,
        matches
      );
      const concurrentlyClaimedProviderSessionId = this.providerSessionIdByUiSessionId.get(
        request.uiSessionId
      );
      if (concurrentlyClaimedProviderSessionId) {
        return { providerSessionId: concurrentlyClaimedProviderSessionId };
      }
      if (concurrentClaimResult === 'waiting') {
        return { providerSessionId: null };
      }

      if (!this.isResolutionActiveForToken(request.uiSessionId, resolutionToken)) {
        return { providerSessionId: null };
      }
      for (const match of matches) {
        if (this.claimProviderSession(request.uiSessionId, match.threadId)) {
          return { providerSessionId: match.threadId };
        }
      }

      return { providerSessionId: null };
    } finally {
      this.completeResolution(request.uiSessionId, resolutionToken);
    }
  }

  releaseProviderSession(uiSessionId: string): void {
    this.activeResolutionTokenByUiSessionId.delete(uiSessionId);
    this.pendingDiscoveryByUiSessionId.delete(uiSessionId);
    const providerSessionId = this.providerSessionIdByUiSessionId.get(uiSessionId);
    if (!providerSessionId) {
      return;
    }

    this.providerSessionIdByUiSessionId.delete(uiSessionId);
    if (this.uiSessionIdByProviderSessionId.get(providerSessionId) === uiSessionId) {
      this.uiSessionIdByProviderSessionId.delete(providerSessionId);
    }
  }

  async readProviderSessionTitle(
    request: ReadAgentProviderSessionTitleRequest
  ): Promise<ReadAgentProviderSessionTitleResult> {
    if (!isCodexAgentCommand(request.agentCommand)) {
      return { title: null };
    }

    const sessionFile = await findCodexSessionFileByThreadId(
      this.resolveCodexSessionsDir(),
      request.providerSessionId
    );
    if (!sessionFile) {
      return { title: null };
    }

    return { title: await this.readCodexFirstUserMessage(sessionFile) };
  }

  private readCodexSessionMeta(filePath: string): Promise<CodexSessionMeta | null> {
    const pendingRead = this.pendingSessionMetaReads.get(filePath);
    if (pendingRead) {
      return pendingRead;
    }

    const read = readCodexSessionMeta(filePath).finally(() => {
      this.pendingSessionMetaReads.delete(filePath);
    });
    this.pendingSessionMetaReads.set(filePath, read);
    return read;
  }

  private claimProviderSession(
    uiSessionId: string | undefined,
    providerSessionId: string
  ): boolean {
    if (!uiSessionId) {
      return true;
    }

    const existingProviderSessionId = this.providerSessionIdByUiSessionId.get(uiSessionId);
    if (existingProviderSessionId) {
      return existingProviderSessionId === providerSessionId;
    }

    const claimedUiSessionId = this.uiSessionIdByProviderSessionId.get(providerSessionId);
    if (claimedUiSessionId && claimedUiSessionId !== uiSessionId) {
      return false;
    }

    this.providerSessionIdByUiSessionId.set(uiSessionId, providerSessionId);
    this.uiSessionIdByProviderSessionId.set(providerSessionId, uiSessionId);
    return true;
  }

  private claimConcurrentProviderSessions(
    uiSessionId: string,
    matches: CodexSessionMeta[]
  ): ConcurrentClaimResult {
    const currentDiscovery = this.pendingDiscoveryByUiSessionId.get(uiSessionId);
    if (!currentDiscovery) {
      return 'not-concurrent';
    }

    const pendingDiscoveries = Array.from(this.pendingDiscoveryByUiSessionId.entries())
      .filter(
        ([pendingUiSessionId, discovery]) =>
          discovery.cwd === currentDiscovery.cwd &&
          discoveryWindowsOverlap(discovery, currentDiscovery) &&
          this.isResolutionActiveForToken(pendingUiSessionId, discovery.token) &&
          !this.providerSessionIdByUiSessionId.has(pendingUiSessionId)
      )
      .sort(([leftUiSessionId, left], [rightUiSessionId, right]) => {
        if (left.createdAt !== right.createdAt) {
          return left.createdAt - right.createdAt;
        }
        return leftUiSessionId.localeCompare(rightUiSessionId);
      });
    if (pendingDiscoveries.length < 2) {
      return pendingDiscoveries.some(([, discovery]) => discovery.requiresBatch)
        ? 'waiting'
        : 'not-concurrent';
    }

    const availableMatches = matches
      .filter((match) => !this.uiSessionIdByProviderSessionId.has(match.threadId))
      .sort((left, right) => {
        if (left.startedAt !== right.startedAt) {
          return left.startedAt - right.startedAt;
        }
        return left.threadId.localeCompare(right.threadId);
      });
    if (availableMatches.length < pendingDiscoveries.length) {
      return 'waiting';
    }
    const selectedMatches = availableMatches.slice(-pendingDiscoveries.length);
    const everyMatchFitsItsDiscovery = pendingDiscoveries.every(([, discovery], index) => {
      const match = selectedMatches[index];
      return Boolean(match && isSessionWithinDiscoveryWindow(match, discovery));
    });
    if (!everyMatchFitsItsDiscovery) {
      return 'waiting';
    }

    for (let index = 0; index < pendingDiscoveries.length; index += 1) {
      const uiSessionId = pendingDiscoveries[index]?.[0];
      const providerSessionId = selectedMatches[index]?.threadId;
      if (uiSessionId && providerSessionId) {
        this.claimProviderSession(uiSessionId, providerSessionId);
      }
    }

    return 'assigned';
  }

  private isResolutionActiveForToken(
    uiSessionId: string | undefined,
    resolutionToken: symbol | undefined
  ): boolean {
    if (!uiSessionId) {
      return true;
    }
    return Boolean(
      resolutionToken &&
        this.activeResolutionTokenByUiSessionId.get(uiSessionId) === resolutionToken
    );
  }

  private completeResolution(
    uiSessionId: string | undefined,
    resolutionToken: symbol | undefined
  ): void {
    if (
      !uiSessionId ||
      !resolutionToken ||
      this.activeResolutionTokenByUiSessionId.get(uiSessionId) !== resolutionToken
    ) {
      return;
    }

    this.activeResolutionTokenByUiSessionId.delete(uiSessionId);
    if (this.pendingDiscoveryByUiSessionId.get(uiSessionId)?.token === resolutionToken) {
      this.pendingDiscoveryByUiSessionId.delete(uiSessionId);
    }
  }

  private readCodexFirstUserMessage(filePath: string): Promise<string | null> {
    const pendingRead = this.pendingSessionTitleReads.get(filePath);
    if (pendingRead) {
      return pendingRead;
    }

    const read = readCodexFirstUserMessage(filePath).finally(() => {
      this.pendingSessionTitleReads.delete(filePath);
    });
    this.pendingSessionTitleReads.set(filePath, read);
    return read;
  }
}

export const agentProviderSessionService = new AgentProviderSessionService();
