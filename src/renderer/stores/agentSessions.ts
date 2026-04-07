import type { PersistentAgentSessionRecord } from '@shared/types';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { normalizePath, pathsEqual } from '@/App/storage';
import {
  type AgentAttachmentItem,
  mergeAgentAttachments,
} from '@/components/chat/agentAttachmentTrayModel';
import type { Session } from '@/components/chat/SessionBar';
import {
  getMeaningfulTerminalTitle,
  getStoredSessionName,
} from '@/components/chat/sessionTitleText';
import type { AgentGroupState } from '@/components/chat/types';
import { createInitialGroupState } from '@/components/chat/types';
import { isSessionPersistable } from '@/lib/agentSessionPersistence';
import { useAgentStatusStore } from './agentStatus';

// Global storage key for all sessions across all repos
export const SESSIONS_STORAGE_KEY = 'enso-agent-sessions';

// Runtime output state for each session
export type OutputState = 'idle' | 'outputting' | 'unread';

export interface SessionRuntimeState {
  outputState: OutputState;
  lastActivityAt: number;
  wasActiveWhenOutputting: boolean; // Track if user was viewing this session during output
  hasCompletedTaskUnread?: boolean;
}

// Enhanced input state for each session
export interface EnhancedInputState {
  open: boolean;
  content: string;
  attachments: AgentAttachmentItem[];
}

export interface AttachmentTrayState {
  attachments: AgentAttachmentItem[];
  isImporting: boolean;
}

// Default state object (cached and frozen to prevent accidental mutation)
const DEFAULT_ENHANCED_INPUT_STATE: EnhancedInputState = Object.freeze({
  open: false,
  content: '',
  attachments: [],
});

const DEFAULT_ATTACHMENT_TRAY_STATE: AttachmentTrayState = Object.freeze({
  attachments: [],
  isImporting: false,
});

// Aggregated state for UI display
export interface AggregatedOutputState {
  total: number;
  outputting: number;
  unread: number;
}

// Group states indexed by normalized worktree path
type WorktreeGroupStates = Record<string, AgentGroupState>;

interface PersistedAgentSessionsSnapshot {
  sessions: Session[];
  activeIds: Record<string, string | null>;
  groupStates: WorktreeGroupStates;
  runtimeStates: Record<string, SessionRuntimeState>;
  enhancedInputStates: Record<string, EnhancedInputState>;
}

interface AgentSessionsState {
  sessions: Session[];
  activeIds: Record<string, string | null>; // key = cwd (worktree path)
  groupStates: WorktreeGroupStates; // Group states per worktree
  runtimeStates: Record<string, SessionRuntimeState>; // Runtime output states (persisted after sanitization)
  enhancedInputStates: Record<string, EnhancedInputState>; // Enhanced input states per session
  attachmentTrayStates: Record<string, AttachmentTrayState>; // Runtime-only tray states per session

  // Actions
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  markSessionExited: (id: string) => void;
  setActiveId: (cwd: string, sessionId: string | null) => void;
  reorderSessions: (repoPath: string, cwd: string, fromIndex: number, toIndex: number) => void;
  getSessions: (repoPath: string, cwd: string) => Session[];
  getActiveSessionId: (repoPath: string, cwd: string) => string | null;
  upsertRecoveredSession: (record: PersistentAgentSessionRecord) => void;

  // Group state actions
  getGroupState: (cwd: string) => AgentGroupState;
  setGroupState: (cwd: string, state: AgentGroupState) => void;
  updateGroupState: (cwd: string, updater: (state: AgentGroupState) => AgentGroupState) => void;
  removeGroupState: (cwd: string) => void;

  // Runtime state actions
  setOutputState: (sessionId: string, outputState: OutputState, isActive?: boolean) => void;
  markAsRead: (sessionId: string) => void;
  markSessionActive: (sessionId: string) => void; // Call when user views a session
  markTaskCompletedUnread: (sessionId: string) => void;
  clearTaskCompletedUnread: (sessionId: string) => void;
  clearTaskCompletedUnreadByWorktree: (cwd: string) => void;
  getOutputState: (sessionId: string) => OutputState;
  getRuntimeState: (sessionId: string) => SessionRuntimeState | undefined;
  clearRuntimeState: (sessionId: string) => void;

  // Enhanced input state actions
  getEnhancedInputState: (sessionId: string) => EnhancedInputState;
  setEnhancedInputOpen: (sessionId: string, open: boolean) => void;
  setEnhancedInputContent: (sessionId: string, content: string) => void;
  setEnhancedInputAttachments: (sessionId: string, attachments: AgentAttachmentItem[]) => void;
  clearEnhancedInput: (sessionId: string, keepOpen?: boolean) => void; // Clear content after sending

  // Attachment tray runtime state actions
  getAttachmentTrayState: (sessionId: string) => AttachmentTrayState;
  setAttachmentTrayAttachments: (sessionId: string, attachments: AgentAttachmentItem[]) => void;
  appendAttachmentTrayAttachments: (sessionId: string, attachments: AgentAttachmentItem[]) => void;
  setAttachmentTrayImporting: (sessionId: string, isImporting: boolean) => void;
  clearAttachmentTray: (sessionId: string) => void;

  // Aggregated state selectors
  getAggregatedByWorktree: (cwd: string) => AggregatedOutputState;
  getAggregatedByRepo: (repoPath: string) => AggregatedOutputState;
  getAggregatedGlobal: () => AggregatedOutputState;
}

function buildEqualFlexPercents(groupCount: number): number[] {
  if (groupCount <= 0) {
    return [];
  }
  if (groupCount === 1) {
    return [100];
  }
  const base = 100 / groupCount;
  return Array.from({ length: groupCount }, () => base);
}

function sanitizeGroupState(
  state: AgentGroupState | undefined,
  validSessionIds: Set<string>
): AgentGroupState {
  if (!state) {
    return createInitialGroupState();
  }

  const groups = state.groups
    .map((group) => {
      const sessionIds = group.sessionIds.filter((sessionId) => validSessionIds.has(sessionId));
      if (sessionIds.length === 0) {
        return null;
      }
      return {
        ...group,
        sessionIds,
        activeSessionId: sessionIds.includes(group.activeSessionId || '')
          ? group.activeSessionId
          : (sessionIds[0] ?? null),
      };
    })
    .filter((group): group is AgentGroupState['groups'][number] => group !== null);

  if (groups.length === 0) {
    return createInitialGroupState();
  }

  const activeGroupId = groups.some((group) => group.id === state.activeGroupId)
    ? state.activeGroupId
    : (groups[0]?.id ?? null);
  const flexPercents =
    state.flexPercents.length === groups.length
      ? [...state.flexPercents]
      : buildEqualFlexPercents(groups.length);

  return {
    groups,
    activeGroupId,
    flexPercents,
  };
}

function sanitizePersistedGroupStates(
  groupStates: unknown,
  sessions: Session[]
): WorktreeGroupStates {
  if (!groupStates || typeof groupStates !== 'object') {
    return {};
  }

  const sessionIdsByWorktree = new Map<string, Set<string>>();
  for (const session of sessions) {
    const key = normalizePath(session.cwd);
    const ids = sessionIdsByWorktree.get(key) ?? new Set<string>();
    ids.add(session.id);
    sessionIdsByWorktree.set(key, ids);
  }

  const sanitized: WorktreeGroupStates = {};
  for (const [cwd, ids] of sessionIdsByWorktree.entries()) {
    const nextState = sanitizeGroupState(
      (groupStates as Record<string, AgentGroupState | undefined>)[cwd],
      ids
    );
    if (nextState.groups.length > 0) {
      sanitized[cwd] = nextState;
    }
  }
  return sanitized;
}

function sanitizePersistedRuntimeStates(
  runtimeStates: unknown,
  persistedSessionIds: Set<string>
): Record<string, SessionRuntimeState> {
  if (!runtimeStates || typeof runtimeStates !== 'object') {
    return {};
  }

  const sanitized: Record<string, SessionRuntimeState> = {};
  for (const sessionId of persistedSessionIds) {
    const current = (runtimeStates as Record<string, SessionRuntimeState | undefined>)[sessionId];
    if (!current) {
      continue;
    }
    const outputState =
      current.outputState === 'unread' || current.outputState === 'outputting' ? 'unread' : 'idle';
    const hasCompletedTaskUnread = Boolean(current.hasCompletedTaskUnread);
    if (outputState === 'idle' && !hasCompletedTaskUnread) {
      continue;
    }
    sanitized[sessionId] = {
      outputState,
      lastActivityAt: typeof current.lastActivityAt === 'number' ? current.lastActivityAt : 0,
      wasActiveWhenOutputting: false,
      hasCompletedTaskUnread,
    };
  }
  return sanitized;
}

function sanitizePersistedEnhancedInputStates(
  enhancedInputStates: unknown,
  persistedSessionIds: Set<string>
): Record<string, EnhancedInputState> {
  if (!enhancedInputStates || typeof enhancedInputStates !== 'object') {
    return {};
  }

  const sanitized: Record<string, EnhancedInputState> = {};
  for (const sessionId of persistedSessionIds) {
    const current = (enhancedInputStates as Record<string, EnhancedInputState | undefined>)[
      sessionId
    ];
    if (!current) {
      continue;
    }
    const currentRecord = current as
      | (EnhancedInputState & {
          imagePaths?: unknown;
        })
      | undefined;
    const attachmentPaths = Array.isArray(currentRecord?.attachments)
      ? currentRecord.attachments
          .map((attachment) => attachment?.path)
          .filter((path): path is string => typeof path === 'string')
      : Array.isArray(currentRecord?.imagePaths)
        ? currentRecord.imagePaths.filter((path): path is string => typeof path === 'string')
        : [];
    const nextState: EnhancedInputState = {
      open: Boolean(current.open),
      content: typeof current.content === 'string' ? current.content : '',
      attachments: mergeAgentAttachments([], attachmentPaths),
    };
    if (nextState.open || nextState.content.length > 0 || nextState.attachments.length > 0) {
      sanitized[sessionId] = nextState;
    }
  }
  return sanitized;
}

function sanitizePersistedSession(session: Session): Session {
  return {
    ...session,
    name: getStoredSessionName(session.name, session.agentId),
    terminalTitle: getMeaningfulTerminalTitle(session.terminalTitle),
  };
}

function loadFromStorage(): PersistedAgentSessionsSnapshot {
  try {
    const saved = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved) as Partial<PersistedAgentSessionsSnapshot>;
      const persistedSessions = Array.isArray(data.sessions) ? data.sessions : [];
      if (persistedSessions.length > 0) {
        // Migrate old sessions that don't have repoPath (backwards compatibility)
        const migratedSessions: Session[] = persistedSessions
          .map((s: Session) => ({
            ...sanitizePersistedSession(s),
            repoPath: s.repoPath || s.cwd,
          }))
          .filter((session: Session) => isSessionPersistable(session));
        const persistedSessionIds = new Set(migratedSessions.map((session) => session.id));
        const sanitizedActiveIds: Record<string, string | null> = {};
        for (const [cwd, id] of Object.entries(
          (data.activeIds as Record<string, string | null>) || {}
        )) {
          sanitizedActiveIds[cwd] = id && persistedSessionIds.has(id) ? id : null;
        }
        return {
          sessions: migratedSessions,
          activeIds: sanitizedActiveIds,
          groupStates: sanitizePersistedGroupStates(data.groupStates, migratedSessions),
          runtimeStates: sanitizePersistedRuntimeStates(data.runtimeStates, persistedSessionIds),
          enhancedInputStates: sanitizePersistedEnhancedInputStates(
            data.enhancedInputStates,
            persistedSessionIds
          ),
        };
      }
    }
  } catch {}
  return {
    sessions: [],
    activeIds: {},
    groupStates: {},
    runtimeStates: {},
    enhancedInputStates: {},
  };
}

function saveToStorage(
  sessions: Session[],
  activeIds: Record<string, string | null>,
  groupStates: WorktreeGroupStates,
  runtimeStates: Record<string, SessionRuntimeState>,
  enhancedInputStates: Record<string, EnhancedInputState>
): void {
  // Only persist sessions that are activated and backed by a recoverable host.
  const persistableSessions = sessions.filter((session) => isSessionPersistable(session));
  const sanitizedPersistableSessions = persistableSessions.map(sanitizePersistedSession);
  const persistableIds = new Set(sanitizedPersistableSessions.map((s) => s.id));
  // Only keep activeIds that reference persistable sessions
  const persistableActiveIds: Record<string, string | null> = {};
  for (const [cwd, id] of Object.entries(activeIds)) {
    persistableActiveIds[cwd] = id && persistableIds.has(id) ? id : null;
  }
  localStorage.setItem(
    SESSIONS_STORAGE_KEY,
    JSON.stringify({
      sessions: sanitizedPersistableSessions,
      activeIds: persistableActiveIds,
      groupStates: sanitizePersistedGroupStates(groupStates, sanitizedPersistableSessions),
      runtimeStates: sanitizePersistedRuntimeStates(runtimeStates, persistableIds),
      enhancedInputStates: sanitizePersistedEnhancedInputStates(
        enhancedInputStates,
        persistableIds
      ),
    } satisfies PersistedAgentSessionsSnapshot)
  );
}

const initialState = loadFromStorage();

/**
 * Compute aggregated output state counts from sessions.
 * Returns counts for total, outputting, and unread sessions.
 */
export function computeAggregatedState(
  sessions: { id: string }[],
  runtimeStates: Record<string, { outputState?: OutputState }>
): AggregatedOutputState {
  let outputting = 0;
  let unread = 0;
  for (const session of sessions) {
    const state = runtimeStates[session.id]?.outputState ?? 'idle';
    if (state === 'outputting') outputting++;
    else if (state === 'unread') unread++;
  }
  return { total: sessions.length, outputting, unread };
}

/**
 * Compute the highest priority output state from sessions.
 * Priority: outputting > unread > idle
 * Used for UI glow effects.
 */
export function computeHighestOutputState(
  sessions: { id: string }[],
  runtimeStates: Record<string, { outputState?: OutputState }>
): OutputState {
  let hasOutputting = false;
  let hasUnread = false;
  for (const session of sessions) {
    const state = runtimeStates[session.id]?.outputState ?? 'idle';
    if (state === 'outputting') hasOutputting = true;
    else if (state === 'unread') hasUnread = true;
  }
  if (hasOutputting) return 'outputting';
  if (hasUnread) return 'unread';
  return 'idle';
}

export const useAgentSessionsStore = create<AgentSessionsState>()(
  subscribeWithSelector((set, get) => ({
    sessions: initialState.sessions,
    activeIds: initialState.activeIds,
    groupStates: initialState.groupStates,
    runtimeStates: initialState.runtimeStates,
    enhancedInputStates: initialState.enhancedInputStates,
    attachmentTrayStates: {},

    addSession: (session) =>
      set((state) => {
        console.log('[AgentSessions] Creating session:', session.sessionId, 'at', session.cwd);

        // Calculate displayOrder: max order in same worktree + 1
        const worktreeSessions = state.sessions.filter(
          (s) => s.repoPath === session.repoPath && pathsEqual(s.cwd, session.cwd)
        );
        const maxOrder = worktreeSessions.reduce(
          (max, s) => Math.max(max, s.displayOrder ?? 0),
          -1
        );
        const newSession = { ...session, displayOrder: maxOrder + 1 };
        return {
          sessions: [...state.sessions, newSession],
          activeIds: { ...state.activeIds, [normalizePath(session.cwd)]: session.id },
          // Initialize enhanced input state for new session to ensure auto-popup works
          enhancedInputStates: {
            ...state.enhancedInputStates,
            [session.id]: { open: false, content: '', attachments: [] },
          },
        };
      }),

    removeSession: (id) =>
      set((state) => {
        const removedSession = state.sessions.find((s) => s.id === id);
        console.log('[AgentSessions] Removing session:', removedSession?.sessionId);

        if (removedSession) {
          const { clearStatus } = useAgentStatusStore.getState();
          clearStatus(removedSession.id);
          if (removedSession.sessionId && removedSession.sessionId !== removedSession.id) {
            clearStatus(removedSession.sessionId);
          }
        }

        const newSessions = state.sessions.filter((s) => s.id !== id);
        let newActiveIds = state.activeIds;
        for (const [cwd, activeId] of Object.entries(state.activeIds)) {
          if (activeId !== id) continue;
          if (newActiveIds === state.activeIds) {
            newActiveIds = { ...state.activeIds };
          }
          newActiveIds[cwd] = null;
        }
        // Clean up runtime states
        const newRuntimeStates = { ...state.runtimeStates };
        delete newRuntimeStates[id];
        // Clean up enhanced input states
        const newEnhancedInputStates = { ...state.enhancedInputStates };
        delete newEnhancedInputStates[id];
        const newAttachmentTrayStates = { ...state.attachmentTrayStates };
        delete newAttachmentTrayStates[id];
        return {
          sessions: newSessions,
          activeIds: newActiveIds,
          runtimeStates: newRuntimeStates,
          enhancedInputStates: newEnhancedInputStates,
          attachmentTrayStates: newAttachmentTrayStates,
        };
      }),

    updateSession: (id, updates) =>
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      })),

    markSessionExited: (id) =>
      set((state) => {
        const session = state.sessions.find((item) => item.id === id);
        if (!session) {
          return state;
        }

        const nextRuntimeStates = { ...state.runtimeStates };
        const currentRuntimeState = nextRuntimeStates[id];
        if (currentRuntimeState) {
          nextRuntimeStates[id] = {
            outputState:
              currentRuntimeState.outputState === 'outputting'
                ? 'unread'
                : currentRuntimeState.outputState,
            lastActivityAt: Date.now(),
            wasActiveWhenOutputting: false,
            hasCompletedTaskUnread: currentRuntimeState.hasCompletedTaskUnread ?? false,
          };
        }

        return {
          sessions: state.sessions.map((item) =>
            item.id === id
              ? {
                  ...item,
                  backendSessionId: undefined,
                  recoveryState: 'dead',
                }
              : item
          ),
          runtimeStates: nextRuntimeStates,
        };
      }),

    setActiveId: (cwd, sessionId) =>
      set((state) => ({
        activeIds: { ...state.activeIds, [normalizePath(cwd)]: sessionId },
      })),

    reorderSessions: (repoPath, cwd, fromIndex, toIndex) =>
      set((state) => {
        // Get sessions for current worktree, sorted by displayOrder
        const worktreeSessions = state.sessions
          .filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd))
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

        if (fromIndex < 0 || fromIndex >= worktreeSessions.length) return state;
        if (toIndex < 0 || toIndex >= worktreeSessions.length) return state;

        // Build new order array
        const orderedIds = worktreeSessions.map((s) => s.id);
        const [movedId] = orderedIds.splice(fromIndex, 1);
        orderedIds.splice(toIndex, 0, movedId);

        // Create id -> new displayOrder map
        const newOrderMap = new Map<string, number>();
        for (let i = 0; i < orderedIds.length; i++) {
          newOrderMap.set(orderedIds[i], i);
        }

        // Update displayOrder for affected sessions only (don't reorder array)
        return {
          sessions: state.sessions.map((s) => {
            if (s.repoPath === repoPath && pathsEqual(s.cwd, cwd)) {
              const newOrder = newOrderMap.get(s.id);
              if (newOrder !== undefined && newOrder !== s.displayOrder) {
                return { ...s, displayOrder: newOrder };
              }
            }
            return s;
          }),
        };
      }),

    getSessions: (repoPath, cwd) => {
      return get()
        .sessions.filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd))
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    },

    getActiveSessionId: (repoPath, cwd) => {
      const state = get();
      const activeId = state.activeIds[normalizePath(cwd)];
      if (activeId) {
        // Verify the session exists and matches repoPath
        const session = state.sessions.find((s) => s.id === activeId);
        if (session && session.repoPath === repoPath) {
          return activeId;
        }
      }
      // Fallback to first session for this repo+cwd
      const firstSession = state.sessions.find(
        (s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd)
      );
      return firstSession?.id || null;
    },

    upsertRecoveredSession: (record) =>
      set((state) => {
        const existing = state.sessions.find((session) => session.id === record.uiSessionId);
        const recoveredSession: Session = {
          id: record.uiSessionId,
          sessionId: record.providerSessionId ?? record.uiSessionId,
          backendSessionId: record.backendSessionId,
          createdAt: record.createdAt,
          name: getStoredSessionName(record.displayName, record.agentId),
          agentId: record.agentId,
          agentCommand: record.agentCommand,
          customPath: record.customPath,
          customArgs: record.customArgs,
          initialized: record.initialized,
          activated: record.activated,
          repoPath: record.repoPath,
          cwd: record.cwd,
          environment: record.environment,
          displayOrder: existing?.displayOrder,
          terminalTitle: getMeaningfulTerminalTitle(existing?.terminalTitle),
          userRenamed: existing?.userRenamed,
          pendingCommand: existing?.pendingCommand,
          persistenceEnabled: true,
          recovered: true,
          recoveryState: record.lastKnownState,
        };

        const sessions = existing
          ? state.sessions.map((session) =>
              session.id === record.uiSessionId ? { ...session, ...recoveredSession } : session
            )
          : [...state.sessions, recoveredSession];

        const activeKey = normalizePath(record.cwd);
        const activeIds = state.activeIds[activeKey]
          ? state.activeIds
          : { ...state.activeIds, [activeKey]: record.uiSessionId };

        return { sessions, activeIds };
      }),

    // Group state actions
    getGroupState: (cwd) => {
      const normalized = normalizePath(cwd);
      return get().groupStates[normalized] || createInitialGroupState();
    },

    setGroupState: (cwd, state) =>
      set((prev) => ({
        groupStates: { ...prev.groupStates, [normalizePath(cwd)]: state },
      })),

    updateGroupState: (cwd, updater) =>
      set((prev) => {
        const normalized = normalizePath(cwd);
        const currentState = prev.groupStates[normalized] || createInitialGroupState();
        return {
          groupStates: { ...prev.groupStates, [normalized]: updater(currentState) },
        };
      }),

    removeGroupState: (cwd) =>
      set((prev) => {
        const normalized = normalizePath(cwd);
        const newStates = { ...prev.groupStates };
        delete newStates[normalized];
        return { groupStates: newStates };
      }),

    // Runtime state actions
    setOutputState: (sessionId, outputState, isActive = false) =>
      set((prev) => {
        const currentState = prev.runtimeStates[sessionId];

        // Handle state transitions
        if (outputState === 'outputting') {
          // Starting to output: just track the state
          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                outputState: 'outputting',
                lastActivityAt: Date.now(),
                wasActiveWhenOutputting: isActive,
                hasCompletedTaskUnread: false,
              },
            },
          };
        }

        if (outputState === 'idle') {
          // If already unread, don't override to idle (preserve unread state)
          // This prevents process activity polling from overriding Stop Hook result
          if (currentState?.outputState === 'unread') {
            return prev;
          }

          // Transitioning to idle: check if we need to mark as unread
          const wasOutputting = currentState?.outputState === 'outputting';
          // Only check if user is CURRENTLY viewing the session
          // If user is not viewing when AI finishes, mark as unread
          const shouldMarkUnread = wasOutputting && !isActive;

          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                outputState: shouldMarkUnread ? 'unread' : 'idle',
                lastActivityAt: Date.now(),
                wasActiveWhenOutputting: false,
                hasCompletedTaskUnread: currentState?.hasCompletedTaskUnread ?? false,
              },
            },
          };
        }

        // For other states (unread), just set directly
        if (currentState?.outputState === outputState) {
          return prev;
        }
        return {
          runtimeStates: {
            ...prev.runtimeStates,
            [sessionId]: {
              outputState,
              lastActivityAt: Date.now(),
              wasActiveWhenOutputting: false,
              hasCompletedTaskUnread: currentState?.hasCompletedTaskUnread ?? false,
            },
          },
        };
      }),

    markAsRead: (sessionId) =>
      set((prev) => {
        const currentState = prev.runtimeStates[sessionId];
        if (!currentState || currentState.outputState !== 'unread') {
          return prev;
        }
        return {
          runtimeStates: {
            ...prev.runtimeStates,
            [sessionId]: {
              ...currentState,
              outputState: 'idle',
            },
          },
        };
      }),

    markSessionActive: (sessionId) =>
      set((prev) => {
        const currentState = prev.runtimeStates[sessionId];
        if (!currentState) {
          return prev;
        }
        // If currently outputting, mark that user is now viewing
        // If unread, mark as read
        if (currentState.outputState === 'outputting') {
          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                ...currentState,
                wasActiveWhenOutputting: true,
                hasCompletedTaskUnread: false,
              },
            },
          };
        }
        if (currentState.outputState === 'unread') {
          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                ...currentState,
                outputState: 'idle',
                hasCompletedTaskUnread: false,
              },
            },
          };
        }
        if (currentState.hasCompletedTaskUnread) {
          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                ...currentState,
                hasCompletedTaskUnread: false,
              },
            },
          };
        }
        return prev;
      }),

    markTaskCompletedUnread: (sessionId) =>
      set((prev) => {
        const currentState = prev.runtimeStates[sessionId];
        if (currentState?.hasCompletedTaskUnread) {
          return prev;
        }
        return {
          runtimeStates: {
            ...prev.runtimeStates,
            [sessionId]: {
              outputState: currentState?.outputState ?? 'idle',
              lastActivityAt: currentState?.lastActivityAt ?? Date.now(),
              wasActiveWhenOutputting: currentState?.wasActiveWhenOutputting ?? false,
              hasCompletedTaskUnread: true,
            },
          },
        };
      }),

    clearTaskCompletedUnread: (sessionId) =>
      set((prev) => {
        const currentState = prev.runtimeStates[sessionId];
        if (!currentState?.hasCompletedTaskUnread) {
          return prev;
        }
        return {
          runtimeStates: {
            ...prev.runtimeStates,
            [sessionId]: {
              ...currentState,
              hasCompletedTaskUnread: false,
            },
          },
        };
      }),

    clearTaskCompletedUnreadByWorktree: (cwd) =>
      set((prev) => {
        const normalizedCwd = normalizePath(cwd);
        let changed = false;
        const nextRuntimeStates = { ...prev.runtimeStates };

        for (const session of prev.sessions) {
          if (normalizePath(session.cwd) !== normalizedCwd) {
            continue;
          }
          const currentState = nextRuntimeStates[session.id];
          if (!currentState?.hasCompletedTaskUnread) {
            continue;
          }
          nextRuntimeStates[session.id] = {
            ...currentState,
            hasCompletedTaskUnread: false,
          };
          changed = true;
        }

        if (!changed) {
          return prev;
        }

        return { runtimeStates: nextRuntimeStates };
      }),

    getOutputState: (sessionId) => {
      return get().runtimeStates[sessionId]?.outputState ?? 'idle';
    },

    getRuntimeState: (sessionId) => {
      return get().runtimeStates[sessionId];
    },

    clearRuntimeState: (sessionId) =>
      set((prev) => {
        const currentState = prev.runtimeStates[sessionId];
        if (!currentState) {
          return prev;
        }
        const hasRecoverableUnread =
          currentState.outputState === 'outputting' ||
          currentState.outputState === 'unread' ||
          currentState.hasCompletedTaskUnread === true;
        if (hasRecoverableUnread) {
          return {
            runtimeStates: {
              ...prev.runtimeStates,
              [sessionId]: {
                outputState: currentState.outputState === 'idle' ? 'idle' : 'unread',
                lastActivityAt: currentState.lastActivityAt,
                wasActiveWhenOutputting: false,
                hasCompletedTaskUnread: currentState.hasCompletedTaskUnread ?? false,
              },
            },
          };
        }
        const newStates = { ...prev.runtimeStates };
        delete newStates[sessionId];
        return { runtimeStates: newStates };
      }),

    // Aggregated state selectors
    getAggregatedByWorktree: (cwd) => {
      const state = get();
      const normalizedCwd = normalizePath(cwd);
      const worktreeSessions = state.sessions.filter((s) => normalizePath(s.cwd) === normalizedCwd);
      return computeAggregatedState(worktreeSessions, state.runtimeStates);
    },

    getAggregatedByRepo: (repoPath) => {
      const state = get();
      const repoSessions = state.sessions.filter((s) => s.repoPath === repoPath);
      return computeAggregatedState(repoSessions, state.runtimeStates);
    },

    getAggregatedGlobal: () => {
      const state = get();
      return computeAggregatedState(state.sessions, state.runtimeStates);
    },

    // Enhanced input state actions
    getEnhancedInputState: (sessionId) => {
      return get().enhancedInputStates[sessionId] ?? DEFAULT_ENHANCED_INPUT_STATE;
    },

    setEnhancedInputOpen: (sessionId, open) =>
      set((prev) => {
        const current = prev.enhancedInputStates[sessionId] ?? DEFAULT_ENHANCED_INPUT_STATE;
        return {
          enhancedInputStates: {
            ...prev.enhancedInputStates,
            [sessionId]: { ...current, open },
          },
        };
      }),

    setEnhancedInputContent: (sessionId, content) =>
      set((prev) => {
        const current = prev.enhancedInputStates[sessionId] ?? DEFAULT_ENHANCED_INPUT_STATE;
        return {
          enhancedInputStates: {
            ...prev.enhancedInputStates,
            [sessionId]: { ...current, content },
          },
        };
      }),

    setEnhancedInputAttachments: (sessionId, attachments) =>
      set((prev) => {
        const current = prev.enhancedInputStates[sessionId] ?? DEFAULT_ENHANCED_INPUT_STATE;
        return {
          enhancedInputStates: {
            ...prev.enhancedInputStates,
            [sessionId]: { ...current, attachments },
          },
        };
      }),

    clearEnhancedInput: (sessionId, keepOpen = false) =>
      set((prev) => {
        const current = prev.enhancedInputStates[sessionId];
        if (!current) return prev;
        return {
          enhancedInputStates: {
            ...prev.enhancedInputStates,
            [sessionId]: { open: keepOpen, content: '', attachments: [] },
          },
        };
      }),

    getAttachmentTrayState: (sessionId) => {
      return get().attachmentTrayStates[sessionId] ?? DEFAULT_ATTACHMENT_TRAY_STATE;
    },

    setAttachmentTrayAttachments: (sessionId, attachments) =>
      set((prev) => {
        const current = prev.attachmentTrayStates[sessionId] ?? DEFAULT_ATTACHMENT_TRAY_STATE;
        return {
          attachmentTrayStates: {
            ...prev.attachmentTrayStates,
            [sessionId]: { ...current, attachments },
          },
        };
      }),

    appendAttachmentTrayAttachments: (sessionId, attachments) =>
      set((prev) => {
        const current = prev.attachmentTrayStates[sessionId] ?? DEFAULT_ATTACHMENT_TRAY_STATE;
        const mergedAttachments = mergeAgentAttachments(
          current.attachments,
          attachments.map((attachment) => attachment.path)
        );
        return {
          attachmentTrayStates: {
            ...prev.attachmentTrayStates,
            [sessionId]: { ...current, attachments: mergedAttachments },
          },
        };
      }),

    setAttachmentTrayImporting: (sessionId, isImporting) =>
      set((prev) => {
        const current = prev.attachmentTrayStates[sessionId] ?? DEFAULT_ATTACHMENT_TRAY_STATE;
        return {
          attachmentTrayStates: {
            ...prev.attachmentTrayStates,
            [sessionId]: { ...current, isImporting },
          },
        };
      }),

    clearAttachmentTray: (sessionId) =>
      set((prev) => {
        if (!prev.attachmentTrayStates[sessionId]) {
          return prev;
        }
        return {
          attachmentTrayStates: {
            ...prev.attachmentTrayStates,
            [sessionId]: DEFAULT_ATTACHMENT_TRAY_STATE,
          },
        };
      }),
  }))
);

/**
 * Selector hook: get active session ID for a given worktree path.
 * Falls back to the first session under that cwd.
 */
export function useActiveSessionId(cwd: string | undefined | null): string | null {
  return useAgentSessionsStore((state) => {
    if (!cwd) return null;
    const key = normalizePath(cwd);
    const activeId = state.activeIds[key];
    if (activeId) {
      const session = state.sessions.find((s) => s.id === activeId);
      if (session) return activeId;
    }
    // Fallback to first session for this cwd
    const first = state.sessions.find((s) => normalizePath(s.cwd) === key);
    return first?.id ?? null;
  });
}

// Subscribe to state changes and persist to localStorage
useAgentSessionsStore.subscribe(
  (state) => ({
    sessions: state.sessions,
    activeIds: state.activeIds,
    groupStates: state.groupStates,
    runtimeStates: state.runtimeStates,
    enhancedInputStates: state.enhancedInputStates,
  }),
  ({ sessions, activeIds, groupStates, runtimeStates, enhancedInputStates }) => {
    saveToStorage(sessions, activeIds, groupStates, runtimeStates, enhancedInputStates);
  },
  {
    equalityFn: (a, b) =>
      a.sessions === b.sessions &&
      a.activeIds === b.activeIds &&
      a.groupStates === b.groupStates &&
      a.runtimeStates === b.runtimeStates &&
      a.enhancedInputStates === b.enhancedInputStates,
  }
);
