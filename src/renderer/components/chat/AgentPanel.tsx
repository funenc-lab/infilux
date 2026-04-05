import type { AIProvider, PersistentAgentSessionRecord } from '@shared/types';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { buildPersistentAgentHostSessionKey } from '@shared/utils/runtimeIdentity';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TEMP_REPO_ID } from '@/App/constants';
import { normalizePath, pathsEqual } from '@/App/storage';
import { ResizeHandle } from '@/components/terminal/ResizeHandle';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import {
  isSessionPersistable,
  isSessionPersistenceEnabledForHost,
} from '@/lib/agentSessionPersistence';
import { getRendererEnvironment } from '@/lib/electronEnvironment';
import {
  onAgentStopNotification,
  onAskUserQuestionNotification,
  onNotificationClick,
  showRendererNotification,
} from '@/lib/electronNotification';
import { buildChatNotificationCopy } from '@/lib/feedbackCopy';
import { pauseFocusLock, restoreFocusIfLocked } from '@/lib/focusLock';
import { defaultDarkTheme, getXtermTheme } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { initAgentStatusListener, useAgentStatusStore } from '@/stores/agentStatus';
import { useCodeReviewContinueStore } from '@/stores/codeReviewContinue';
import { useEditorStore } from '@/stores/editor';
import { BUILTIN_AGENT_IDS, useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import { buildConsoleButtonStyle, buildConsoleTypographyModel } from '../layout/consoleTypography';
import { AgentCloseSessionDialog } from './AgentCloseSessionDialog';
import { AgentGroup } from './AgentGroup';
import { AgentTerminal } from './AgentTerminal';
import { AgentPanelEmptyState } from './agent-panel/AgentPanelEmptyState';
import type { AgentAttachmentItem } from './agentAttachmentTrayModel';
import {
  probeRemoteAgentAvailability,
  resolvePersistedInstalledAgents,
  resolveRemoteInstalledAgents,
} from './agentAvailability';
import { buildAgentEmptyStateModel } from './agentEmptyStateModel';
import {
  resolveAgentInputAvailability,
  resolveAgentInputUnavailableReason,
} from './agentInputAvailability';
import { supportsAgentNativeTerminalInput } from './agentInputMode';
import { collectMountedAgentSessionIds } from './agentPanelMountPolicy';
import { restoreWorktreeAgentSessions } from './agentSessionRecovery';
import { findAutoSessionRolloverTarget } from './autoSessionRolloverPolicy';
import { EnhancedInputContainer } from './EnhancedInputContainer';
import { QuickTerminalModal } from './QuickTerminalModal';
import type { Session } from './SessionBar';
import { SessionPersistenceNotice } from './SessionPersistenceNotice';
import { StatusLine } from './StatusLine';
import { buildSessionHandoffPrompt } from './sessionHandoffPrompt';
import { shouldShowSessionPersistenceNotice } from './sessionPersistenceNoticePolicy';
import { resolveSessionTitleFromFirstInput } from './sessionTitlePolicy';
import type { AgentGroupState, AgentGroup as AgentGroupType } from './types';
import { createInitialGroupState } from './types';

export interface AgentPanelProps {
  repoPath: string; // repository path (workspace identifier)
  cwd: string; // current worktree path
  isActive?: boolean;
  onSwitchWorktree?: (worktreePath: string) => void;
}

// Agent display names and commands
const AGENT_INFO: Record<string, { name: string; command: string }> = {
  claude: { name: 'Claude', command: 'claude' },
  codex: { name: 'Codex', command: 'codex' },
  droid: { name: 'Droid', command: 'droid' },
  gemini: { name: 'Gemini', command: 'gemini' },
  auggie: { name: 'Auggie', command: 'auggie' },
  cursor: { name: 'Cursor', command: 'cursor-agent' },
  opencode: { name: 'OpenCode', command: 'opencode' },
};

function buildPersistentHostSessionKey(uiSessionId: string): string {
  return buildPersistentAgentHostSessionKey(uiSessionId, getRendererEnvironment().runtimeChannel);
}

function buildPersistentRecord(session: Session): PersistentAgentSessionRecord {
  const isWindows = getRendererEnvironment().platform === 'win32';
  const createdAt = session.createdAt ?? Date.now();

  return {
    uiSessionId: session.id,
    backendSessionId: session.backendSessionId,
    providerSessionId: session.sessionId,
    agentId: session.agentId,
    agentCommand: session.agentCommand,
    customPath: session.customPath,
    customArgs: session.customArgs,
    environment: session.environment || 'native',
    repoPath: session.repoPath,
    cwd: session.cwd,
    displayName: session.name,
    activated: Boolean(session.activated),
    initialized: session.initialized,
    hostKind: isWindows ? 'supervisor' : 'tmux',
    hostSessionKey: isWindows
      ? (session.backendSessionId ?? session.id)
      : buildPersistentHostSessionKey(session.id),
    recoveryPolicy: 'auto',
    createdAt,
    updatedAt: Date.now(),
    lastKnownState: session.recoveryState ?? 'live',
  };
}

/**
 * Whether the session uses Cursor CLI. Terminal-title sync only applies to Cursor.
 */
function isCursorAgent(agentId: string): boolean {
  const baseId = agentId.replace(/-(hapi|happy)$/, '');
  return baseId === 'cursor';
}

/**
 * Default display name for a session (before any title from CLI or first input).
 *
 * Session name priority (highest → lowest):
 *   1. User manual rename (via context menu) — sets `name`, clears `terminalTitle`
 *   2. Terminal title from OSC escape sequence (`terminalTitle`) — updates `name` when still default (Cursor only)
 *   3. First meaningful user input line (`onActivatedWithFirstLine`) — sets `name` when still default & no terminalTitle
 *   4. Default agent display name (this function) — e.g. "Claude", "Claude (Hapi)"
 *
 * Display in SessionBar: `session.terminalTitle || session.name`
 */
function getDefaultSessionName(agentId: string): string {
  const isHapi = agentId.endsWith('-hapi');
  const isHappy = agentId.endsWith('-happy');
  const baseId = isHapi
    ? agentId.slice(0, -'-hapi'.length)
    : isHappy
      ? agentId.slice(0, -'-happy'.length)
      : agentId;
  const baseName = AGENT_INFO[baseId]?.name ?? 'Agent';
  return isHapi ? `${baseName} (Hapi)` : isHappy ? `${baseName} (Happy)` : baseName;
}

function getDefaultAgentId(
  agentSettings: Record<string, { enabled: boolean; isDefault: boolean }>
): string {
  // Find the default agent
  for (const [id, config] of Object.entries(agentSettings)) {
    if (config.isDefault && config.enabled) {
      return id;
    }
  }
  // Fallback to first enabled builtin agent
  for (const id of BUILTIN_AGENT_IDS) {
    if (agentSettings[id]?.enabled) {
      return id;
    }
  }
  // Ultimate fallback
  return 'claude';
}

function getAgentDisplayLabel(
  agentId: string,
  customAgents: Array<{ id: string; name: string; command: string }>
): string {
  const isHapi = agentId.endsWith('-hapi');
  const isHappy = agentId.endsWith('-happy');
  const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;
  const customAgent = customAgents.find((agent) => agent.id === baseId);
  const baseName = customAgent?.name ?? AGENT_INFO[baseId]?.name ?? baseId;
  return isHapi ? `${baseName} (Hapi)` : isHappy ? `${baseName} (Happy)` : baseName;
}

function buildSessionPanelDomId(sessionId: string): string {
  return `agent-session-panel-${sessionId}`;
}

function createSession(
  repoPath: string,
  cwd: string,
  agentId: string,
  customAgents: Array<{ id: string; name: string; command: string }>,
  agentSettings: Record<
    string,
    { enabled: boolean; isDefault: boolean; customPath?: string; customArgs?: string }
  >,
  persistenceEnabled: boolean
): Session {
  // Handle Hapi and Happy agent IDs
  // e.g., 'claude-hapi' -> base is 'claude', 'claude-happy' -> base is 'claude'
  const isHapi = agentId.endsWith('-hapi');
  const isHappy = agentId.endsWith('-happy');
  const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;

  // Check if it's a custom agent
  const customAgent = customAgents.find((a) => a.id === baseId);
  const info = customAgent
    ? { name: customAgent.name, command: customAgent.command }
    : AGENT_INFO[baseId] || { name: 'Claude', command: 'claude' };

  // Build display name with environment suffix
  const displayName = isHapi ? `${info.name} (Hapi)` : isHappy ? `${info.name} (Happy)` : info.name;

  // Determine environment
  const environment = isHapi ? 'hapi' : isHappy ? 'happy' : 'native';

  // Get custom path and args from settings (for builtin agents)
  const agentConfig = agentSettings[baseId];
  const customPath = agentConfig?.customPath;
  const customArgs = agentConfig?.customArgs;

  const id = crypto.randomUUID();
  return {
    id,
    sessionId: id, // Initialize sessionId with same value as id
    createdAt: Date.now(),
    name: displayName,
    agentId,
    agentCommand: info.command,
    customPath,
    customArgs,
    initialized: false,
    repoPath,
    cwd,
    environment,
    persistenceEnabled,
  };
}

function createSessionWithOverrides(
  repoPath: string,
  cwd: string,
  agentId: string,
  customAgents: Array<{ id: string; name: string; command: string }>,
  agentSettings: Record<
    string,
    { enabled: boolean; isDefault: boolean; customPath?: string; customArgs?: string }
  >,
  persistenceEnabled: boolean,
  overrides: Partial<Session> = {}
): Session {
  return {
    ...createSession(repoPath, cwd, agentId, customAgents, agentSettings, persistenceEnabled),
    ...overrides,
  };
}

/**
 * Measures the combined height of the bottom bar (EnhancedInput + StatusLine)
 * and reports it so the terminal container can leave enough space.
 */
const GroupBottomBar = memo(function GroupBottomBar({
  groupId,
  onHeightChange,
  children,
}: {
  groupId: string;
  onHeightChange: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let last = -1;
    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      onHeightChange((prev) => {
        if (prev[groupId] === height) return prev;
        return { ...prev, [groupId]: height };
      });
    };

    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, [groupId, onHeightChange]);

  return (
    <div ref={ref} className="mt-auto pointer-events-auto">
      {children}
    </div>
  );
});

export function AgentPanel({ repoPath, cwd, isActive = false, onSwitchWorktree }: AgentPanelProps) {
  const { t } = useI18n();
  const platform = getRendererEnvironment().platform;
  const isWindows = platform === 'win32';
  const panelRef = useRef<HTMLDivElement>(null); // 容器引用
  const {
    agentSettings,
    agentDetectionStatus,
    customAgents,
    xtermKeybindings,
    hapiSettings,
    autoCreateSessionOnActivate,
    autoCreateSessionOnTempActivate,
    claudeCodeIntegration,
    terminalTheme,
    fontFamily,
    fontSize,
    editorSettings,
  } = useSettingsStore();
  const setClaudeCodeIntegration = useSettingsStore((state) => state.setClaudeCodeIntegration);
  const confirmBeforeClosingAgentSession = useSettingsStore(
    (s) => s.confirmBeforeClosingAgentSession
  );
  // 添加 ?? true 回退，兼容老用户可能没有 enabled 字段的情况
  const quickTerminalEnabled = useSettingsStore((s) => s.quickTerminal.enabled ?? true);
  const quickTerminalOpen = useSettingsStore((s) => s.quickTerminal.isOpen);
  const setQuickTerminalOpen = useSettingsStore((s) => s.setQuickTerminalOpen);
  const { getQuickTerminalSession, setQuickTerminalSession, removeQuickTerminalSession } =
    useTerminalStore();
  const currentQuickTerminalSession = getQuickTerminalSession(cwd);
  const [tmuxInstalled, setTmuxInstalled] = useState<boolean | null>(null);
  const [isEnablingSessionPersistence, setIsEnablingSessionPersistence] = useState(false);

  // 用于强制重新创建 QuickTerminalModal 的 key
  // 当功能被禁用再启用时递增，确保创建全新的 terminal
  const [quickTerminalMountKey, setQuickTerminalMountKey] = useState(0);
  const prevQuickTerminalEnabled = useRef(quickTerminalEnabled);
  useEffect(() => {
    if (quickTerminalEnabled && !prevQuickTerminalEnabled.current) {
      // 功能从禁用变为启用，递增 key 强制重新创建
      setQuickTerminalMountKey((k) => k + 1);
    }
    if (!quickTerminalEnabled && prevQuickTerminalEnabled.current) {
      // 功能从启用变为禁用，清理 session
      if (currentQuickTerminalSession) {
        window.electronAPI.session.kill(currentQuickTerminalSession).catch(console.error);
      }
      removeQuickTerminalSession(cwd);
      setQuickTerminalOpen(false);
    }
    prevQuickTerminalEnabled.current = quickTerminalEnabled;
  }, [
    quickTerminalEnabled,
    cwd,
    currentQuickTerminalSession,
    removeQuickTerminalSession,
    setQuickTerminalOpen,
  ]);

  const bgImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);
  const terminalBgColor = useMemo(() => {
    if (bgImageEnabled) return 'transparent';
    return getXtermTheme(terminalTheme)?.background ?? defaultDarkTheme.background;
  }, [terminalTheme, bgImageEnabled]);
  const statusLineEnabled = claudeCodeIntegration.statusLineEnabled;
  const defaultAgentId = useMemo(() => getDefaultAgentId(agentSettings), [agentSettings]);
  const isRemoteRepo = useMemo(() => isRemoteVirtualPath(repoPath), [repoPath]);
  const { setAgentCount, registerAgentCloseHandler } = useWorktreeActivityStore();
  const upsertRecoveredSession = useAgentSessionsStore((s) => s.upsertRecoveredSession);

  const [hasRunningProcess, setHasRunningProcess] = useState(false);
  const [pendingCloseSession, setPendingCloseSession] = useState<{
    id: string;
    groupId?: string;
    name: string;
  } | null>(null);
  const autoRolledOverSessionIdsRef = useRef<Set<string>>(new Set());
  const quickTerminalFocusLeaseRef = useRef<{
    release: (() => void) | null;
    sessionId: string | null;
  }>({
    release: null,
    sessionId: null,
  });

  const handleQuickTerminalSessionInit = useCallback(
    (sessionId: string) => {
      // 总是更新 session，覆盖可能存在的旧记录（对应已销毁的 PTY）
      setQuickTerminalSession(cwd, sessionId);
    },
    [cwd, setQuickTerminalSession]
  );

  // 监听终端会话状态
  useEffect(() => {
    // 只要有 session 存在就认为是 active（有 PTY 在运行）
    setHasRunningProcess(!!currentQuickTerminalSession);
  }, [currentQuickTerminalSession]);

  // Global session IDs to keep terminals mounted across group moves
  const [globalSessionIds, setGlobalSessionIds] = useState<Set<string>>(new Set());

  // Track StatusLine height per group to avoid cross-column races.
  // When split panels render multiple StatusLines, a newly mounted/empty column can report 0,
  // which would incorrectly collapse the global height and cause EnhancedInput to cover StatusLine.
  const [statusLineHeightsByGroupId, setStatusLineHeightsByGroupId] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (!statusLineEnabled) {
      setStatusLineHeightsByGroupId({});
    }
  }, [statusLineEnabled]);

  // Use zustand store for sessions and group states - state persists even when component unmounts
  const allSessions = useAgentSessionsStore((state) => state.sessions);
  const addSession = useAgentSessionsStore((state) => state.addSession);
  const removeSession = useAgentSessionsStore((state) => state.removeSession);
  const updateSession = useAgentSessionsStore((state) => state.updateSession);
  const setActiveId = useAgentSessionsStore((state) => state.setActiveId);
  const persistableSessions = useMemo(
    () => allSessions.filter((session) => isSessionPersistable(session)),
    [allSessions]
  );

  // Enhanced input state actions from store
  const setEnhancedInputOpen = useAgentSessionsStore((state) => state.setEnhancedInputOpen);
  const getEnhancedInputState = useAgentSessionsStore((state) => state.getEnhancedInputState);

  // Group states from store (persists across component remounts)
  const worktreeGroupStates = useAgentSessionsStore((state) => state.groupStates);
  const setGroupState = useAgentSessionsStore((state) => state.setGroupState);
  const updateGroupState = useAgentSessionsStore((state) => state.updateGroupState);
  const removeGroupState = useAgentSessionsStore((state) => state.removeGroupState);
  const editorTabs = useEditorStore((state) => state.tabs);
  const editorCurrentWorktreePath = useEditorStore((state) => state.currentWorktreePath);
  const editorWorktreeStates = useEditorStore((state) => state.worktreeStates);

  // Get current worktree's group state
  const currentGroupState = useMemo(() => {
    if (!cwd) return createInitialGroupState();
    const normalizedCwd = normalizePath(cwd);
    return worktreeGroupStates[normalizedCwd] || createInitialGroupState();
  }, [cwd, worktreeGroupStates]);

  const { groups, activeGroupId } = currentGroupState;

  const getCurrentActiveSessionId = useCallback(() => {
    return groups.find((group) => group.id === activeGroupId)?.activeSessionId ?? null;
  }, [groups, activeGroupId]);
  const sessionPersistenceEnabled = useMemo(
    () =>
      isSessionPersistenceEnabledForHost({
        cwd,
        platform,
        tmuxEnabled: claudeCodeIntegration.tmuxEnabled,
      }),
    [cwd, platform, claudeCodeIntegration.tmuxEnabled]
  );
  const showSessionPersistenceNotice = useMemo(
    () =>
      shouldShowSessionPersistenceNotice({
        isRemoteRepo,
        platform,
        tmuxEnabled: claudeCodeIntegration.tmuxEnabled,
        tmuxInstalled,
      }),
    [claudeCodeIntegration.tmuxEnabled, isRemoteRepo, platform, tmuxInstalled]
  );

  useEffect(() => {
    let cancelled = false;

    if (isRemoteRepo || isWindows || claudeCodeIntegration.tmuxEnabled) {
      setTmuxInstalled(null);
      return () => {
        cancelled = true;
      };
    }

    void window.electronAPI.tmux
      .check(repoPath, false)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setTmuxInstalled(result.installed);
      })
      .catch((error) => {
        console.error('[AgentPanel] Failed to check tmux availability', error);
        if (!cancelled) {
          setTmuxInstalled(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [claudeCodeIntegration.tmuxEnabled, isRemoteRepo, isWindows, repoPath]);

  const handleEnableSessionPersistence = useCallback(() => {
    setIsEnablingSessionPersistence(true);

    void window.electronAPI.tmux
      .check(repoPath, true)
      .then((result) => {
        if (!result.installed) {
          setTmuxInstalled(false);
          toastManager.add({
            type: 'error',
            title: t('Tmux Session'),
            description: t('tmux is not installed. Please install tmux first.'),
          });
          return;
        }

        setTmuxInstalled(true);
        setClaudeCodeIntegration({ tmuxEnabled: true });
        toastManager.add({
          type: 'success',
          title: t('Tmux Session'),
          description: t(
            'Recovery now applies to new local sessions. Restart current sessions to make them recoverable after app restart.'
          ),
        });
      })
      .catch((error) => {
        toastManager.add({
          type: 'error',
          title: t('Tmux Session'),
          description: error instanceof Error ? error.message : t('Unable to execute action.'),
        });
      })
      .finally(() => {
        setIsEnablingSessionPersistence(false);
      });
  }, [repoPath, setClaudeCodeIntegration, t]);

  const pauseQuickTerminalFocusLock = useCallback(() => {
    if (quickTerminalFocusLeaseRef.current.release) return;

    const currentActiveSessionId = getCurrentActiveSessionId();
    if (!currentActiveSessionId) return;

    quickTerminalFocusLeaseRef.current = {
      sessionId: currentActiveSessionId,
      release: pauseFocusLock(currentActiveSessionId),
    };
  }, [getCurrentActiveSessionId]);

  const releaseQuickTerminalFocusLock = useCallback((shouldRestore: boolean) => {
    const { release, sessionId: pausedSessionId } = quickTerminalFocusLeaseRef.current;

    quickTerminalFocusLeaseRef.current = { release: null, sessionId: null };
    release?.();

    if (!shouldRestore || !pausedSessionId) return;

    // 关闭覆盖层后，需要先等本轮状态提交和 overlay 卸载完成，
    // 再等下一帧让浏览器完成焦点结算，否则 restore 时 isFocusLocked()
    // 仍可能读取到旧的 pause 状态，导致恢复被短路。
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoreFocusIfLocked(pausedSessionId);
      });
    });
  }, []);

  const handleToggleQuickTerminal = useCallback(() => {
    const nextOpen = !quickTerminalOpen;
    if (nextOpen) {
      pauseQuickTerminalFocusLock();
    }

    setQuickTerminalOpen(nextOpen);
    if (!nextOpen) {
      releaseQuickTerminalFocusLock(true);
    }
  }, [
    quickTerminalOpen,
    setQuickTerminalOpen,
    pauseQuickTerminalFocusLock,
    releaseQuickTerminalFocusLock,
  ]);

  const handleQuickTerminalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        pauseQuickTerminalFocusLock();
      }

      setQuickTerminalOpen(open);
      if (!open) {
        releaseQuickTerminalFocusLock(true);
      }
    },
    [setQuickTerminalOpen, pauseQuickTerminalFocusLock, releaseQuickTerminalFocusLock]
  );

  const handleCloseQuickTerminal = useCallback(() => {
    if (currentQuickTerminalSession) {
      window.electronAPI.session.kill(currentQuickTerminalSession).catch(console.error);
    }

    // 关闭 modal
    setQuickTerminalOpen(false);

    // 清除 session 记录
    if (currentQuickTerminalSession) {
      removeQuickTerminalSession(cwd);
    }
    releaseQuickTerminalFocusLock(true);
  }, [
    currentQuickTerminalSession,
    cwd,
    setQuickTerminalOpen,
    removeQuickTerminalSession,
    releaseQuickTerminalFocusLock,
  ]);

  useEffect(() => {
    if (quickTerminalOpen && isActive) {
      pauseQuickTerminalFocusLock();
      return;
    }

    if (!quickTerminalOpen && quickTerminalFocusLeaseRef.current.release) {
      releaseQuickTerminalFocusLock(true);
    }
  }, [quickTerminalOpen, isActive, pauseQuickTerminalFocusLock, releaseQuickTerminalFocusLock]);

  useEffect(() => {
    return () => {
      releaseQuickTerminalFocusLock(false);
    };
  }, [releaseQuickTerminalFocusLock]);

  // Update group state helper - uses store instead of local state
  const updateCurrentGroupState = useCallback(
    (updater: (state: AgentGroupState) => AgentGroupState) => {
      if (!cwd) return;
      updateGroupState(cwd, updater);
    },
    [cwd, updateGroupState]
  );

  // Filter sessions for current repo+worktree (for SessionBar display, sorted by displayOrder)
  const currentWorktreeSessions = useMemo(() => {
    return allSessions
      .filter((s) => s.repoPath === repoPath && pathsEqual(s.cwd, cwd))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [allSessions, repoPath, cwd]);
  const agentStatuses = useAgentStatusStore((state) => state.statuses);

  useEffect(() => {
    const currentSessionIds = new Set(currentWorktreeSessions.map((session) => session.id));
    for (const handledSessionId of autoRolledOverSessionIdsRef.current) {
      if (!currentSessionIds.has(handledSessionId)) {
        autoRolledOverSessionIdsRef.current.delete(handledSessionId);
      }
    }
  }, [currentWorktreeSessions]);

  const getOpenFilePathsForWorktree = useCallback(
    (worktreePath: string): string[] => {
      const tabsForWorktree =
        editorCurrentWorktreePath !== null && pathsEqual(editorCurrentWorktreePath, worktreePath)
          ? editorTabs
          : (Object.entries(editorWorktreeStates).find(([savedWorktreePath]) =>
              pathsEqual(savedWorktreePath, worktreePath)
            )?.[1].tabs ?? []);

      return Array.from(
        new Set(tabsForWorktree.map((tab) => tab.path).filter((path) => path.length > 0))
      );
    },
    [editorCurrentWorktreePath, editorTabs, editorWorktreeStates]
  );

  const killBackendSession = useCallback((session?: Session) => {
    if (!session) {
      return;
    }

    if (getRendererEnvironment().platform !== 'win32') {
      void window.electronAPI.tmux
        .killSession(session.cwd, buildPersistentHostSessionKey(session.id))
        .catch(() => {});
    }

    if (!session.backendSessionId) {
      return;
    }

    window.electronAPI.session.kill(session.backendSessionId).catch((error) => {
      console.error(
        `[AgentPanel] Failed to kill backend session ${session.backendSessionId}`,
        error
      );
    });
  }, []);

  useEffect(() => {
    void Promise.allSettled(
      persistableSessions.map((session) =>
        window.electronAPI.agentSession.markPersistent(buildPersistentRecord(session))
      )
    );
  }, [persistableSessions]);

  useEffect(() => {
    void restoreWorktreeAgentSessions({
      repoPath,
      cwd,
      restoreWorktreeSessions: window.electronAPI.agentSession.restoreWorktreeSessions,
      upsertRecoveredSession,
      updateGroupState,
    }).catch((error) => {
      console.error('[AgentPanel] Failed to restore worktree sessions', error);
    });
  }, [cwd, repoPath, updateGroupState, upsertRecoveredSession]);

  // Sync activeIds from store to group state when changed externally (e.g., from RunningProjectsPopover)
  useEffect(() => {
    if (!cwd || groups.length === 0) return;

    const normalizedCwd = normalizePath(cwd);
    const unsubscribe = useAgentSessionsStore.subscribe(
      (state) => state.activeIds[normalizedCwd],
      (storeActiveId) => {
        if (!storeActiveId) return;

        // Find which group contains this session
        const targetGroup = groups.find((g) => g.sessionIds.includes(storeActiveId));
        if (!targetGroup) return;

        // Only update if different from current group's activeSessionId
        if (targetGroup.activeSessionId !== storeActiveId) {
          updateCurrentGroupState((state) => ({
            ...state,
            groups: state.groups.map((g) =>
              g.id === targetGroup.id ? { ...g, activeSessionId: storeActiveId } : g
            ),
            activeGroupId: targetGroup.id,
          }));
        }
      }
    );

    return unsubscribe;
  }, [cwd, groups, updateCurrentGroupState]);

  const [installedAgents, setInstalledAgents] = useState<Set<string>>(new Set());

  // Build installed agents from persisted local detection or remote runtime probing.
  useEffect(() => {
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
    if (enabledAgentIds.length === 0) {
      setInstalledAgents(new Set());
      return;
    }

    if (!isRemoteRepo) {
      setInstalledAgents(
        resolvePersistedInstalledAgents({
          agentSettings,
          agentDetectionStatus,
          hapiEnabled: hapiSettings.enabled,
          happyEnabled: hapiSettings.happyEnabled,
          trustDefaultAgent: true,
        })
      );
      return;
    }

    let cancelled = false;
    void resolveRemoteInstalledAgents(
      {
        enabledAgentIds,
        agentSettings,
        customAgents,
        hapiEnabled: hapiSettings.enabled,
        happyEnabled: hapiSettings.happyEnabled,
      },
      {
        detectCli: (agentId, customAgent, customPath) =>
          window.electronAPI.cli.detectOne(repoPath, agentId, customAgent, customPath),
        checkHapi: () => window.electronAPI.hapi.checkGlobal(repoPath, false),
        checkHappy: () => window.electronAPI.happy.checkGlobal(repoPath, false),
      }
    )
      .then((nextInstalledAgents) => {
        if (!cancelled) {
          setInstalledAgents(nextInstalledAgents);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInstalledAgents(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    agentSettings,
    agentDetectionStatus,
    customAgents,
    hapiSettings.enabled,
    hapiSettings.happyEnabled,
    isRemoteRepo,
    repoPath,
  ]);

  // Filter to only enabled AND installed agents
  const enabledAgents = useMemo(() => {
    return Object.keys(agentSettings).filter((id) => {
      if (!agentSettings[id]?.enabled || !installedAgents.has(id)) return false;
      if (id.endsWith('-hapi') && !hapiSettings.enabled) return false;
      if (id.endsWith('-happy') && !hapiSettings.happyEnabled) return false;
      return true;
    });
  }, [agentSettings, installedAgents, hapiSettings.enabled, hapiSettings.happyEnabled]);

  // Sync initialized agent session counts to worktree activity store
  useEffect(() => {
    // Always set current worktree count (even if 0)
    if (cwd) {
      const count = allSessions.filter((s) => s.cwd === cwd && s.initialized).length;
      setAgentCount(cwd, count);
    }
  }, [allSessions, cwd, setAgentCount]);

  // Listen for code review continue conversation request
  const pendingContinueSessionId = useCodeReviewContinueStore(
    (s) => s.continueConversation.sessionId
  );
  const pendingContinueProvider = useCodeReviewContinueStore(
    (s) => s.continueConversation.provider
  );
  const clearContinueRequest = useCodeReviewContinueStore((s) => s.clearContinueRequest);

  // Map AI provider (code review) to agent id for "Continue Conversation"
  const continueAgentId = useMemo(() => {
    const map: Record<AIProvider, string> = {
      'claude-code': 'claude',
      'codex-cli': 'codex',
      'cursor-cli': 'cursor',
      'gemini-cli': 'gemini',
    };
    return pendingContinueProvider != null ? (map[pendingContinueProvider] ?? 'claude') : 'claude';
  }, [pendingContinueProvider]);

  useEffect(() => {
    if (pendingContinueSessionId && cwd) {
      const info = AGENT_INFO[continueAgentId] ?? { name: 'Claude', command: 'claude' };
      const newSession: Session = {
        id: crypto.randomUUID(), // Generate new session ID
        sessionId: pendingContinueSessionId, // Use code review's sessionId for --resume
        createdAt: Date.now(),
        name: 'Code Review',
        agentId: continueAgentId,
        agentCommand: info.command,
        repoPath,
        cwd,
        initialized: true, // Mark as initialized to use --resume
        environment: 'native',
        persistenceEnabled: sessionPersistenceEnabled,
      };

      addSession(newSession);

      updateCurrentGroupState((state) => {
        const groupId = state.activeGroupId || state.groups[0]?.id;
        if (!groupId) {
          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [newSession.id],
            activeSessionId: newSession.id,
          };
          return {
            groups: [newGroup],
            activeGroupId: newGroup.id,
            flexPercents: [100],
          };
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  sessionIds: [...g.sessionIds, newSession.id],
                  activeSessionId: newSession.id,
                }
              : g
          ),
        };
      });

      setActiveId(cwd, newSession.id);
      clearContinueRequest();
    }
  }, [
    pendingContinueSessionId,
    continueAgentId,
    cwd,
    repoPath,
    addSession,
    updateCurrentGroupState,
    setActiveId,
    sessionPersistenceEnabled,
    clearContinueRequest,
  ]);

  // Register close handler for external close requests
  useEffect(() => {
    const handleCloseAll = (worktreePath: string) => {
      // Close every session for the worktree, including uninitialized ones, to avoid orphaned state.
      const worktreeSessions = allSessions.filter((s) => pathsEqual(s.cwd, worktreePath));
      if (worktreeSessions.length === 0) return;

      for (const session of worktreeSessions) {
        if (session.initialized) {
          killBackendSession(session);
        }
        void window.electronAPI.agentSession.abandon(session.id);
        removeSession(session.id);
      }

      // Remove group state for this worktree
      removeGroupState(worktreePath);

      // Set count to 0
      setAgentCount(worktreePath, 0);
    };

    return registerAgentCloseHandler(handleCloseAll);
  }, [
    registerAgentCloseHandler,
    setAgentCount,
    allSessions,
    killBackendSession,
    removeSession,
    removeGroupState,
  ]);

  const ensureAgentLaunchable = useCallback(
    async (agentId: string) => {
      if (!isRemoteRepo) {
        return true;
      }

      try {
        const availability = await probeRemoteAgentAvailability(
          {
            agentId,
            agentSettings,
            customAgents,
            hapiEnabled: hapiSettings.enabled,
            happyEnabled: hapiSettings.happyEnabled,
          },
          {
            detectCli: (nextAgentId, customAgent, customPath) =>
              window.electronAPI.cli.detectOne(repoPath, nextAgentId, customAgent, customPath),
            checkHapi: () => window.electronAPI.hapi.checkGlobal(repoPath, false),
            checkHappy: () => window.electronAPI.happy.checkGlobal(repoPath, false),
          }
        );

        if (availability.available) {
          return true;
        }

        let description = t(
          'The selected agent is not available on the remote host. Install it remotely and try again.'
        );
        if (availability.reason === 'agent-missing') {
          description = t(
            'The selected agent CLI is not installed on the remote host. Install it remotely and try again.'
          );
        } else if (availability.reason === 'hapi-disabled') {
          description = t('Enable Hapi in settings before starting this remote session.');
        } else if (availability.reason === 'hapi-missing') {
          description = t(
            'The hapi wrapper is not installed on the remote host. Install it remotely and try again.'
          );
        } else if (availability.reason === 'happy-disabled') {
          description = t('Enable Happy in settings before starting this remote session.');
        } else if (availability.reason === 'happy-missing') {
          description = t(
            'The happy wrapper is not installed on the remote host. Install it remotely and try again.'
          );
        }

        toastManager.add({
          type: 'error',
          title: t('Unable to start remote agent'),
          description,
        });

        setInstalledAgents((prev) => {
          if (!prev.has(agentId)) {
            return prev;
          }

          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });

        return false;
      } catch (error) {
        toastManager.add({
          type: 'error',
          title: t('Unable to verify remote agent'),
          description:
            error instanceof Error
              ? error.message
              : t('Check the remote host connection and try again.'),
        });
        return false;
      }
    },
    [
      agentSettings,
      customAgents,
      hapiSettings.enabled,
      hapiSettings.happyEnabled,
      isRemoteRepo,
      repoPath,
      t,
    ]
  );

  // Handle new session in active group
  const handleNewSession = useCallback(
    (targetGroupId?: string, sessionOverrides: Partial<Session> = {}) => {
      void (async () => {
        if (!(await ensureAgentLaunchable(defaultAgentId))) {
          return;
        }

        const newSession = createSessionWithOverrides(
          repoPath,
          cwd,
          defaultAgentId,
          customAgents,
          agentSettings,
          sessionPersistenceEnabled,
          sessionOverrides
        );
        addSession(newSession);

        const baseAgentId = defaultAgentId.replace(/-hapi$/, '').replace(/-happy$/, '');
        const autoPopupMode = claudeCodeIntegration.enhancedInputAutoPopup;
        if (
          baseAgentId === 'claude' &&
          claudeCodeIntegration.enhancedInputEnabled &&
          (autoPopupMode === 'always' || autoPopupMode === 'hideWhileRunning')
        ) {
          setEnhancedInputOpen(newSession.id, true);
        }

        updateCurrentGroupState((state) => {
          const groupId = targetGroupId || state.activeGroupId || state.groups[0]?.id;
          if (!groupId) {
            const newGroup: AgentGroupType = {
              id: crypto.randomUUID(),
              sessionIds: [newSession.id],
              activeSessionId: newSession.id,
            };
            return {
              groups: [newGroup],
              activeGroupId: newGroup.id,
              flexPercents: [100],
            };
          }

          return {
            ...state,
            groups: state.groups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    sessionIds: [...g.sessionIds, newSession.id],
                    activeSessionId: newSession.id,
                  }
                : g
            ),
          };
        });
      })();
    },
    [
      repoPath,
      cwd,
      defaultAgentId,
      customAgents,
      agentSettings,
      sessionPersistenceEnabled,
      addSession,
      updateCurrentGroupState,
      claudeCodeIntegration.enhancedInputEnabled,
      claudeCodeIntegration.enhancedInputAutoPopup,
      setEnhancedInputOpen,
      ensureAgentLaunchable,
    ]
  );

  const handleNewSessionWithAgent = useCallback(
    (
      agentId: string,
      _agentCommand: string,
      targetGroupId?: string,
      sessionOverrides: Partial<Session> = {}
    ) => {
      void (async () => {
        if (!(await ensureAgentLaunchable(agentId))) {
          return;
        }

        const newSession = createSessionWithOverrides(
          repoPath,
          cwd,
          agentId,
          customAgents,
          agentSettings,
          sessionPersistenceEnabled,
          sessionOverrides
        );
        addSession(newSession);

        const baseId = agentId.replace(/-hapi$/, '').replace(/-happy$/, '');
        const autoPopupMode = claudeCodeIntegration.enhancedInputAutoPopup;
        if (
          baseId === 'claude' &&
          !supportsAgentNativeTerminalInput(agentId) &&
          claudeCodeIntegration.enhancedInputEnabled &&
          (autoPopupMode === 'always' || autoPopupMode === 'hideWhileRunning')
        ) {
          setEnhancedInputOpen(newSession.id, true);
        }

        updateCurrentGroupState((state) => {
          const groupId = targetGroupId || state.activeGroupId || state.groups[0]?.id;
          if (!groupId) {
            const newGroup: AgentGroupType = {
              id: crypto.randomUUID(),
              sessionIds: [newSession.id],
              activeSessionId: newSession.id,
            };
            return {
              groups: [newGroup],
              activeGroupId: newGroup.id,
              flexPercents: [100],
            };
          }

          return {
            ...state,
            groups: state.groups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    sessionIds: [...g.sessionIds, newSession.id],
                    activeSessionId: newSession.id,
                  }
                : g
            ),
          };
        });
      })();
    },
    [
      repoPath,
      cwd,
      customAgents,
      agentSettings,
      sessionPersistenceEnabled,
      addSession,
      updateCurrentGroupState,
      ensureAgentLaunchable,
      claudeCodeIntegration.enhancedInputEnabled,
      claudeCodeIntegration.enhancedInputAutoPopup,
      setEnhancedInputOpen,
    ]
  );

  const handleStartFreshSession = useCallback(
    (session: Session, groupId: string) => {
      void (async () => {
        const status = agentStatuses[session.id];
        const openFiles = getOpenFilePathsForWorktree(session.cwd);
        const contextWindow = status?.contextWindow;
        const currentUsage = contextWindow?.currentUsage;
        const contextUsagePercent =
          currentUsage && contextWindow?.contextWindowSize
            ? Math.round(
                ((currentUsage.inputTokens +
                  currentUsage.cacheCreationInputTokens +
                  currentUsage.cacheReadInputTokens) /
                  contextWindow.contextWindowSize) *
                  100
              )
            : undefined;

        let gitStatus: Awaited<ReturnType<typeof window.electronAPI.git.getStatus>> | null = null;
        let diffStats: Awaited<ReturnType<typeof window.electronAPI.git.getDiffStats>> | null =
          null;

        const [gitStatusResult, diffStatsResult] = await Promise.allSettled([
          window.electronAPI.git.getStatus(session.cwd),
          window.electronAPI.git.getDiffStats(session.cwd),
        ]);

        if (gitStatusResult.status === 'fulfilled') {
          gitStatus = gitStatusResult.value;
        }

        if (diffStatsResult.status === 'fulfilled') {
          diffStats = diffStatsResult.value;
        }

        const handoffPrompt = buildSessionHandoffPrompt({
          sessionName: session.name,
          worktreePath: session.cwd,
          projectPath: status?.workspace?.projectDir,
          contextUsagePercent,
          gitStatus,
          diffStats,
          openFiles,
        });

        handleNewSessionWithAgent(session.agentId, session.agentCommand, groupId, {
          activated: true,
          pendingCommand: handoffPrompt,
        });
      })();
    },
    [agentStatuses, getOpenFilePathsForWorktree, handleNewSessionWithAgent]
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const target = findAutoSessionRolloverTarget({
      mode: claudeCodeIntegration.autoSessionRollover,
      groupState: currentGroupState,
      sessions: currentWorktreeSessions,
      statuses: agentStatuses,
      handledSessionIds: autoRolledOverSessionIdsRef.current,
    });
    if (!target) {
      return;
    }

    autoRolledOverSessionIdsRef.current.add(target.session.id);
    handleStartFreshSession(target.session, target.groupId);
  }, [
    isActive,
    currentGroupState,
    currentWorktreeSessions,
    agentStatuses,
    claudeCodeIntegration.autoSessionRollover,
    handleStartFreshSession,
  ]);

  const removeSessionFromUi = useCallback(
    (id: string, groupId?: string) => {
      removeSession(id);

      updateCurrentGroupState((state) => {
        const targetGroupId = groupId || state.groups.find((g) => g.sessionIds.includes(id))?.id;
        if (!targetGroupId) return state;

        const group = state.groups.find((g) => g.id === targetGroupId);
        if (!group) return state;

        const newSessionIds = group.sessionIds.filter((sid) => sid !== id);

        if (newSessionIds.length === 0) {
          const newGroups = state.groups.filter((g) => g.id !== targetGroupId);

          if (newGroups.length === 0) {
            return createInitialGroupState();
          }

          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          let newActiveGroupId = state.activeGroupId;
          if (state.activeGroupId === targetGroupId) {
            const removedIndex = state.groups.findIndex((g) => g.id === targetGroupId);
            const newIndex = Math.min(removedIndex, newGroups.length - 1);
            newActiveGroupId = newGroups[newIndex]?.id || null;
          }

          return {
            groups: newGroups,
            activeGroupId: newActiveGroupId,
            flexPercents: newFlexPercents,
          };
        }

        let newActiveSessionId = group.activeSessionId;
        if (group.activeSessionId === id) {
          const closedIndex = group.sessionIds.indexOf(id);
          const newIndex = Math.min(closedIndex, newSessionIds.length - 1);
          newActiveSessionId = newSessionIds[newIndex];
        }

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === targetGroupId
              ? { ...g, sessionIds: newSessionIds, activeSessionId: newActiveSessionId }
              : g
          ),
        };
      });
    },
    [removeSession, updateCurrentGroupState]
  );

  const handleCloseSessionNow = useCallback(
    (id: string, groupId?: string) => {
      const session = allSessions.find((s) => s.id === id);
      if (!session) return;

      killBackendSession(session);
      void window.electronAPI.agentSession.abandon(id);
      removeSessionFromUi(id, groupId);
    },
    [allSessions, killBackendSession, removeSessionFromUi]
  );

  const handleCloseSession = useCallback(
    (id: string, groupId?: string) => {
      const session = allSessions.find((s) => s.id === id);
      if (!session) return;

      if (!confirmBeforeClosingAgentSession) {
        handleCloseSessionNow(id, groupId);
        return;
      }

      setPendingCloseSession({
        id,
        groupId,
        name: session.terminalTitle || session.name || session.agentId || 'Agent session',
      });
    },
    [allSessions, confirmBeforeClosingAgentSession, handleCloseSessionNow]
  );

  const handleConfirmCloseSession = useCallback(() => {
    if (!pendingCloseSession) return;

    const { id, groupId } = pendingCloseSession;
    setPendingCloseSession(null);
    handleCloseSessionNow(id, groupId);
  }, [handleCloseSessionNow, pendingCloseSession]);

  useEffect(() => {
    if (!pendingCloseSession) return;

    const sessionStillExists = allSessions.some((session) => session.id === pendingCloseSession.id);
    if (!sessionStillExists) {
      setPendingCloseSession(null);
    }
  }, [allSessions, pendingCloseSession]);

  const handleSessionExit = useCallback(
    (id: string, groupId?: string) => {
      removeSessionFromUi(id, groupId);
    },
    [removeSessionFromUi]
  );

  // Handle session selection
  const handleSelectSession = useCallback(
    (id: string, groupId?: string) => {
      setActiveId(cwd, id);

      updateCurrentGroupState((state) => {
        const targetGroupId = groupId || state.groups.find((g) => g.sessionIds.includes(id))?.id;
        if (!targetGroupId) return state;

        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === targetGroupId ? { ...g, activeSessionId: id } : g
          ),
          activeGroupId: targetGroupId,
        };
      });
    },
    [cwd, setActiveId, updateCurrentGroupState]
  );

  // Notification payload may carry either UI session id or Claude sessionId.
  const findSessionByNotificationId = useCallback(
    (incomingSessionId: string) =>
      allSessions.find((s) => s.id === incomingSessionId || s.sessionId === incomingSessionId),
    [allSessions]
  );

  // 监听通知点击，激活对应 session 并切换 worktree
  useEffect(() => {
    const unsubscribe = onNotificationClick((sessionId) => {
      const session = findSessionByNotificationId(sessionId);
      if (session && !pathsEqual(session.cwd, cwd) && onSwitchWorktree) {
        onSwitchWorktree(session.cwd);
      }
      if (session) {
        handleSelectSession(session.id);
      }
    });
    return unsubscribe;
  }, [handleSelectSession, findSessionByNotificationId, cwd, onSwitchWorktree]);

  // Enhanced input sender ref (unchanged)
  const enhancedInputSenderRef = useRef<
    Map<string, (content: string, attachments: AgentAttachmentItem[]) => boolean>
  >(new Map());

  // 监听 Claude stop hook 通知，精确更新 output state 并发送完成通知
  const setOutputState = useAgentSessionsStore((s) => s.setOutputState);
  const markTaskCompletedUnread = useAgentSessionsStore((s) => s.markTaskCompletedUnread);
  const getActivityState = useWorktreeActivityStore((s) => s.getActivityState);
  useEffect(() => {
    const unsubscribe = onAgentStopNotification(({ sessionId, taskCompletionStatus }) => {
      const session = findSessionByNotificationId(sessionId);
      if (session) {
        // Check if user is currently viewing this session
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        const isViewingSession =
          activeGroup?.activeSessionId === session.id && pathsEqual(session.cwd, cwd) && isActive;

        // Update output state to idle (will become 'unread' if user is not viewing)
        setOutputState(session.id, 'idle', isViewingSession);

        if (taskCompletionStatus === 'completed' && !isViewingSession) {
          markTaskCompletedUnread(session.id);
        }

        // Check if enhanced input is enabled and should auto popup
        // Auto popup requires:
        // 1. enhancedInputEnabled
        // 2. enhancedInputAutoPopup is 'always' or 'hideWhileRunning'
        // 3. stopHookEnabled (for Claude Code)
        // 4. NOT in 'waiting_input' state (AskUserQuestion or Permission Prompt active)
        const autoPopupMode = claudeCodeIntegration.enhancedInputAutoPopup;
        const activityState = getActivityState(session.cwd);
        const shouldAutoPopup =
          session.agentId === 'claude' &&
          !supportsAgentNativeTerminalInput(session.agentId) &&
          claudeCodeIntegration.enhancedInputEnabled &&
          (autoPopupMode === 'always' || autoPopupMode === 'hideWhileRunning') &&
          claudeCodeIntegration.stopHookEnabled &&
          activityState !== 'waiting_input';

        // Auto popup enhanced input if enabled
        // Now we set the open state in store - it persists per session
        if (shouldAutoPopup) {
          setEnhancedInputOpen(sessionId, true);
        }

        // Send system notification
        const projectName = session.cwd.split('/').pop() || 'Unknown';
        const agentName = AGENT_INFO[session.agentId]?.name || session.agentCommand;
        // Use terminal title as body, fall back to project name
        const notificationBody = session.terminalTitle || projectName;
        const notificationCopy = buildChatNotificationCopy(
          {
            action: 'command-completed',
            command: agentName,
            body: notificationBody,
          },
          t
        );
        void showRendererNotification({
          title: notificationCopy.title,
          body: notificationCopy.body,
          sessionId: session.id,
        });
      }
    });
    return unsubscribe;
  }, [
    findSessionByNotificationId,
    t,
    groups,
    activeGroupId,
    cwd,
    isActive,
    setOutputState,
    markTaskCompletedUnread,
    getActivityState,
    claudeCodeIntegration,
    setEnhancedInputOpen,
  ]);

  // Note: EnhancedInput open state is now stored per-session in the store
  // No need to auto-collapse on session switch - each session keeps its own state

  // 监听 Claude AskUserQuestion 通知
  useEffect(() => {
    const unsubscribe = onAskUserQuestionNotification(({ sessionId, toolInput }) => {
      const session = findSessionByNotificationId(sessionId);
      if (session) {
        const agentName = AGENT_INFO[session.agentId]?.name || session.agentCommand;

        // Extract first question text if available
        let questionPreview = t('User response required');
        if (toolInput && typeof toolInput === 'object' && 'questions' in toolInput) {
          const questions = (toolInput as { questions: Array<{ question: string }> }).questions;
          if (questions?.[0]?.question) {
            questionPreview = questions[0].question;
          }
        }

        const notificationCopy = buildChatNotificationCopy(
          {
            action: 'waiting-input',
            command: agentName,
            preview: questionPreview,
          },
          t
        );
        void showRendererNotification({
          title: notificationCopy.title,
          body: notificationCopy.body,
          sessionId: session.id,
        });
      }
    });
    return unsubscribe;
  }, [findSessionByNotificationId, t]);

  // 监听 Claude status line 更新
  useEffect(() => {
    const unsubscribe = initAgentStatusListener();
    return unsubscribe;
  }, []);

  const handleNextSession = useCallback(() => {
    const activeGroup = groups.find((g) => g.id === activeGroupId);
    if (!activeGroup || activeGroup.sessionIds.length <= 1) return;

    const currentIndex = activeGroup.sessionIds.indexOf(activeGroup.activeSessionId || '');
    const nextIndex = (currentIndex + 1) % activeGroup.sessionIds.length;
    const nextSessionId = activeGroup.sessionIds[nextIndex];

    setActiveId(cwd, nextSessionId);
    updateCurrentGroupState((state) => ({
      ...state,
      groups: state.groups.map((g) =>
        g.id === activeGroupId ? { ...g, activeSessionId: nextSessionId } : g
      ),
    }));
  }, [groups, activeGroupId, cwd, setActiveId, updateCurrentGroupState]);

  const handlePrevSession = useCallback(() => {
    const activeGroup = groups.find((g) => g.id === activeGroupId);
    if (!activeGroup || activeGroup.sessionIds.length <= 1) return;

    const currentIndex = activeGroup.sessionIds.indexOf(activeGroup.activeSessionId || '');
    const prevIndex = currentIndex <= 0 ? activeGroup.sessionIds.length - 1 : currentIndex - 1;
    const prevSessionId = activeGroup.sessionIds[prevIndex];

    setActiveId(cwd, prevSessionId);
    updateCurrentGroupState((state) => ({
      ...state,
      groups: state.groups.map((g) =>
        g.id === activeGroupId ? { ...g, activeSessionId: prevSessionId } : g
      ),
    }));
  }, [groups, activeGroupId, cwd, setActiveId, updateCurrentGroupState]);

  const handleInitialized = useCallback(
    (id: string) => {
      // Read session from store directly to avoid stale closure
      const session = useAgentSessionsStore.getState().sessions.find((s) => s.id === id);
      if (!session) return;

      // Update initialized state and clear pendingCommand (prompt is passed via CLI arg)
      updateSession(id, { initialized: true, pendingCommand: undefined });
    },
    [updateSession]
  );

  const handleActivated = useCallback(
    (id: string) => {
      updateSession(id, { activated: true });
    },
    [updateSession]
  );

  const handleActivatedWithFirstLine = useCallback(
    (id: string, line: string) => {
      const session = allSessions.find((s) => s.id === id);
      if (!session) return;

      const defaultName = getDefaultSessionName(session.agentId);
      const nextTitle = resolveSessionTitleFromFirstInput({
        line,
        currentName: session.name,
        defaultName,
        terminalTitle: session.terminalTitle,
        userRenamed: session.userRenamed,
      });
      if (!nextTitle) return;

      updateSession(id, { name: nextTitle });
    },
    [allSessions, updateSession]
  );

  const handleRenameSession = useCallback(
    (id: string, name: string) => {
      updateSession(id, { name, terminalTitle: undefined, userRenamed: true });
    },
    [updateSession]
  );

  const handleReorderSessions = useCallback(
    (groupId: string, fromIndex: number, toIndex: number) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const newSessionIds = [...group.sessionIds];
      const [removed] = newSessionIds.splice(fromIndex, 1);
      newSessionIds.splice(toIndex, 0, removed);

      // Update group.sessionIds order (immediate visual)
      updateCurrentGroupState((state) => ({
        ...state,
        groups: state.groups.map((g) =>
          g.id === groupId ? { ...g, sessionIds: newSessionIds } : g
        ),
      }));

      // Update displayOrder in store for persistence
      for (let i = 0; i < newSessionIds.length; i++) {
        updateSession(newSessionIds[i], { displayOrder: i });
      }
    },
    [groups, updateCurrentGroupState, updateSession]
  );

  // Handle group click
  const handleGroupClick = useCallback(
    (groupId: string) => {
      updateCurrentGroupState((state) => ({
        ...state,
        activeGroupId: groupId,
      }));
    },
    [updateCurrentGroupState]
  );

  // Handle split - create new group to the right
  // If source group has multiple sessions, move the active session to new group
  // If source group has only 1 session, create a new session in new group
  const handleSplit = useCallback(
    (fromGroupId: string) => {
      if (!cwd) return;

      updateCurrentGroupState((state) => {
        const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
        if (fromIndex === -1) return state;

        const sourceGroup = state.groups[fromIndex];

        // If source group has multiple sessions, move the active session to new group
        if (sourceGroup.sessionIds.length > 1 && sourceGroup.activeSessionId) {
          const sessionToMove = sourceGroup.activeSessionId;

          // Remove session from source group
          const newSourceSessionIds = sourceGroup.sessionIds.filter((id) => id !== sessionToMove);
          const closedIndex = sourceGroup.sessionIds.indexOf(sessionToMove);
          const newSourceActiveIndex = Math.min(closedIndex, newSourceSessionIds.length - 1);
          const newSourceActiveSessionId = newSourceSessionIds[newSourceActiveIndex] || null;

          // Create new group with the moved session
          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [sessionToMove],
            activeSessionId: sessionToMove,
          };

          const newGroups = state.groups.map((g) =>
            g.id === fromGroupId
              ? { ...g, sessionIds: newSourceSessionIds, activeSessionId: newSourceActiveSessionId }
              : g
          );
          newGroups.splice(fromIndex + 1, 0, newGroup);

          // Recalculate flex percentages evenly
          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          return {
            ...state,
            groups: newGroups,
            activeGroupId: newGroup.id,
            flexPercents: newFlexPercents,
          };
        }

        // Source group has only 1 session, create a new session in new group
        return state;
      });

      const sourceGroup = groups.find((group) => group.id === fromGroupId);
      if (!sourceGroup || sourceGroup.sessionIds.length > 1) {
        return;
      }

      void (async () => {
        if (!(await ensureAgentLaunchable(defaultAgentId))) {
          return;
        }

        const newSession = createSession(
          repoPath,
          cwd,
          defaultAgentId,
          customAgents,
          agentSettings,
          sessionPersistenceEnabled
        );
        addSession(newSession);

        updateCurrentGroupState((state) => {
          const fromIndex = state.groups.findIndex((group) => group.id === fromGroupId);
          if (fromIndex === -1) {
            return state;
          }

          const newGroup: AgentGroupType = {
            id: crypto.randomUUID(),
            sessionIds: [newSession.id],
            activeSessionId: newSession.id,
          };

          const newGroups = [...state.groups];
          newGroups.splice(fromIndex + 1, 0, newGroup);
          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          return {
            ...state,
            groups: newGroups,
            activeGroupId: newGroup.id,
            flexPercents: newFlexPercents,
          };
        });
      })();
    },
    [
      cwd,
      repoPath,
      groups,
      defaultAgentId,
      customAgents,
      agentSettings,
      sessionPersistenceEnabled,
      addSession,
      updateCurrentGroupState,
      ensureAgentLaunchable,
    ]
  );

  // Handle merge - move active session from current group to previous group
  const handleMerge = useCallback(
    (fromGroupId: string) => {
      updateCurrentGroupState((state) => {
        const fromIndex = state.groups.findIndex((g) => g.id === fromGroupId);
        if (fromIndex <= 0) return state; // Can't merge first group

        const fromGroup = state.groups[fromIndex];
        const targetGroup = state.groups[fromIndex - 1];

        if (!fromGroup.activeSessionId) return state;

        const movingSessionId = fromGroup.activeSessionId;
        const remainingSessionIds = fromGroup.sessionIds.filter((id) => id !== movingSessionId);

        // If from group becomes empty, remove it
        if (remainingSessionIds.length === 0) {
          const newGroups = state.groups.filter((g) => g.id !== fromGroupId);
          newGroups[fromIndex - 1] = {
            ...targetGroup,
            sessionIds: [...targetGroup.sessionIds, movingSessionId],
            activeSessionId: movingSessionId,
          };

          const newFlexPercents = newGroups.map(() => 100 / newGroups.length);

          return {
            groups: newGroups,
            activeGroupId: targetGroup.id,
            flexPercents: newFlexPercents,
          };
        }

        // From group still has sessions
        const newActiveInFromGroup = remainingSessionIds[0] || null;
        const newGroups = state.groups.map((g) => {
          if (g.id === targetGroup.id) {
            return {
              ...g,
              sessionIds: [...g.sessionIds, movingSessionId],
              activeSessionId: movingSessionId,
            };
          }
          if (g.id === fromGroupId) {
            return {
              ...g,
              sessionIds: remainingSessionIds,
              activeSessionId: newActiveInFromGroup,
            };
          }
          return g;
        });

        return {
          ...state,
          groups: newGroups,
          activeGroupId: targetGroup.id,
        };
      });
    },
    [updateCurrentGroupState]
  );

  // Handle resize between groups
  const handleResize = useCallback(
    (index: number, deltaPercent: number) => {
      updateCurrentGroupState((state) => {
        if (state.groups.length < 2) return state;

        const newFlexPercents = [...state.flexPercents];
        const minPercent = 20;

        // Adjust the two adjacent groups
        const leftNew = newFlexPercents[index] + deltaPercent;
        const rightNew = newFlexPercents[index + 1] - deltaPercent;

        // Clamp to minimum
        if (leftNew >= minPercent && rightNew >= minPercent) {
          newFlexPercents[index] = leftNew;
          newFlexPercents[index + 1] = rightNew;
        }

        return {
          ...state,
          flexPercents: newFlexPercents,
        };
      });
    },
    [updateCurrentGroupState]
  );

  const shouldAutoCreateSession =
    repoPath === TEMP_REPO_ID ? autoCreateSessionOnTempActivate : autoCreateSessionOnActivate;

  // Auto-create first session when panel becomes active and empty (if enabled in settings)
  useEffect(() => {
    if (
      shouldAutoCreateSession &&
      isActive &&
      cwd &&
      groups.length === 0 &&
      currentWorktreeSessions.length === 0
    ) {
      handleNewSession();
    }
  }, [
    shouldAutoCreateSession,
    isActive,
    cwd,
    groups.length,
    currentWorktreeSessions.length,
    handleNewSession,
  ]);

  // Sync sessions to groups on initial load or when sessions change externally
  useEffect(() => {
    if (!cwd || currentWorktreeSessions.length === 0) return;

    const normalizedCwd = normalizePath(cwd);
    const currentState = worktreeGroupStates[normalizedCwd];
    const storeActiveId = useAgentSessionsStore.getState().activeIds[normalizedCwd];

    // If no groups exist but sessions do, create a group with all sessions
    if (!currentState || currentState.groups.length === 0) {
      const sessionIds = currentWorktreeSessions.map((s) => s.id);

      // Get the active session ID from store (if set) or fallback to first session
      const validActiveId = sessionIds.includes(storeActiveId || '')
        ? storeActiveId
        : sessionIds[0];

      const newGroup: AgentGroupType = {
        id: crypto.randomUUID(),
        sessionIds,
        activeSessionId: validActiveId || null,
      };
      setGroupState(cwd, {
        groups: [newGroup],
        activeGroupId: newGroup.id,
        flexPercents: [100],
      });
    } else {
      // Add orphaned sessions (e.g. created by auto-execute) to the active group
      const allGroupSessionIds = new Set(currentState.groups.flatMap((g) => g.sessionIds));
      const orphanedSessionIds = currentWorktreeSessions
        .filter((s) => !allGroupSessionIds.has(s.id))
        .map((s) => s.id);

      if (orphanedSessionIds.length > 0) {
        const targetGroupId = currentState.activeGroupId || currentState.groups[0]?.id;
        if (targetGroupId) {
          setGroupState(cwd, {
            ...currentState,
            groups: currentState.groups.map((g) =>
              g.id === targetGroupId
                ? {
                    ...g,
                    sessionIds: [...g.sessionIds, ...orphanedSessionIds],
                    activeSessionId: storeActiveId ?? g.activeSessionId,
                  }
                : g
            ),
          });
        }
      }
    }
  }, [cwd, currentWorktreeSessions, worktreeGroupStates, setGroupState]);

  // Keep mounted terminals scoped to the current worktree.
  // Worktree-level panel caching already preserves terminals across worktree switches.
  useEffect(() => {
    const mountedSessionIds = collectMountedAgentSessionIds(allSessions, repoPath, cwd);
    const mountedSessionIdSet = new Set(mountedSessionIds);

    setGlobalSessionIds((prev) => {
      const next = new Set(prev);
      for (const id of mountedSessionIds) {
        next.add(id);
      }

      for (const id of next) {
        if (!mountedSessionIdSet.has(id)) {
          next.delete(id);
        }
      }

      return next;
    });
  }, [allSessions, cwd, repoPath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;
      if (pendingCloseSession) return;

      if (matchesKeybinding(e, xtermKeybindings.newTab)) {
        e.preventDefault();
        handleNewSession();
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.closeTab)) {
        e.preventDefault();
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup?.activeSessionId) {
          handleCloseSession(activeGroup.activeSessionId, activeGroup.id);
        }
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.nextTab)) {
        e.preventDefault();
        handleNextSession();
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.prevTab)) {
        e.preventDefault();
        handlePrevSession();
        return;
      }

      if (e.metaKey && e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup) {
          const index = Number.parseInt(e.key, 10) - 1;
          if (index < activeGroup.sessionIds.length) {
            e.preventDefault();
            handleSelectSession(activeGroup.sessionIds[index], activeGroup.id);
            return;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    pendingCloseSession,
    groups,
    activeGroupId,
    xtermKeybindings,
    handleNewSession,
    handleCloseSession,
    handleNextSession,
    handlePrevSession,
    handleSelectSession,
  ]);

  // Quick Terminal 快捷键监听
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+` 或 Cmd+` (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        handleToggleQuickTerminal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleToggleQuickTerminal]);

  const maxStatusLineHeight = useMemo(() => {
    let max = 0;
    for (const h of Object.values(statusLineHeightsByGroupId)) {
      if (h > max) max = h;
    }
    return max;
  }, [statusLineHeightsByGroupId]);
  const defaultAgentLabel = getAgentDisplayLabel(defaultAgentId, customAgents);
  const emptyStateModel = useMemo(
    () =>
      buildAgentEmptyStateModel({
        defaultAgentLabel,
        enabledAgentCount: enabledAgents.length,
        t,
      }),
    [defaultAgentLabel, enabledAgents.length, t]
  );
  const emptyStateTypography = useMemo(
    () =>
      buildConsoleTypographyModel({
        appFontFamily: fontFamily,
        appFontSize: fontSize,
        editorFontFamily: editorSettings.fontFamily,
        editorFontSize: editorSettings.fontSize,
        editorLineHeight: editorSettings.lineHeight,
      }),
    [fontFamily, fontSize, editorSettings]
  );
  const emptyStateButtonStyle = useMemo(
    () => buildConsoleButtonStyle(emptyStateTypography),
    [emptyStateTypography]
  );
  const emptyStateProfiles = useMemo(
    () =>
      [...enabledAgents]
        .sort((a, b) => {
          const aDefault = agentSettings[a]?.isDefault ? 1 : 0;
          const bDefault = agentSettings[b]?.isDefault ? 1 : 0;
          return bDefault - aDefault;
        })
        .map((agentId) => {
          const isHapi = agentId.endsWith('-hapi');
          const isHappy = agentId.endsWith('-happy');
          const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;
          const customAgent = customAgents.find((agent) => agent.id === baseId);

          return {
            agentId,
            command: customAgent?.command ?? AGENT_INFO[baseId]?.command ?? 'claude',
            isDefault: Boolean(agentSettings[agentId]?.isDefault),
            name: getAgentDisplayLabel(agentId, customAgents),
          };
        }),
    [agentSettings, customAgents, enabledAgents]
  );
  const handleOpenAgentSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-settings-agent'));
  }, []);

  if (!cwd) return null;

  // Check if current worktree has any groups (used for empty state detection)
  const hasAnyGroups = groups.length > 0;

  // Helper to find session info (which worktree, group, index)
  const findSessionInfo = (sessionId: string) => {
    for (const [worktreePath, state] of Object.entries(worktreeGroupStates)) {
      for (let groupIndex = 0; groupIndex < state.groups.length; groupIndex++) {
        const group = state.groups[groupIndex];
        if (group.sessionIds.includes(sessionId)) {
          const session = allSessions.find((s) => s.id === sessionId);
          if (session) {
            return { worktreePath, state, group, groupIndex, session };
          }
        }
      }
    }
    return null;
  };

  // Calculate cumulative left positions for groups
  const getGroupPositions = (state: AgentGroupState) => {
    const positions: { left: number; width: number }[] = [];
    let cumulative = 0;
    for (const percent of state.flexPercents) {
      positions.push({ left: cumulative, width: percent });
      cumulative += percent;
    }
    return positions;
  };

  // Check if current worktree has no sessions (for empty state overlay)
  const showEmptyState = !hasAnyGroups && currentWorktreeSessions.length === 0;

  // Get current worktree's group positions for terminal placement
  const currentGroupPositions = getGroupPositions(currentGroupState);

  return (
    <div
      ref={panelRef}
      className="relative h-full w-full"
      style={{ backgroundColor: terminalBgColor }}
    >
      {showSessionPersistenceNotice ? (
        <SessionPersistenceNotice
          isPending={isEnablingSessionPersistence}
          onEnableRecovery={handleEnableSessionPersistence}
        />
      ) : null}
      {/* Empty state overlay - shown when current worktree has no sessions */}
      {/* IMPORTANT: Don't use early return here - terminals must stay mounted to prevent PTY destruction */}
      {showEmptyState ? (
        <AgentPanelEmptyState
          bgImageEnabled={bgImageEnabled}
          buttonStyle={emptyStateButtonStyle}
          cwd={cwd}
          defaultAgentLabel={defaultAgentLabel}
          emptyStateModel={emptyStateModel}
          enabledAgentCount={enabledAgents.length}
          onOpenAgentSettings={handleOpenAgentSettings}
          onStartDefaultSession={handleNewSession}
          onStartSessionWithAgent={handleNewSessionWithAgent}
          profiles={emptyStateProfiles}
        />
      ) : null}
      {/* Resize handles - only for current worktree */}
      {currentGroupState.groups.length > 1 &&
        currentGroupState.groups.map((group, index) => {
          if (index >= currentGroupState.groups.length - 1) return null;
          const leftPos = currentGroupPositions
            .slice(0, index + 1)
            .reduce((sum, p) => sum + p.width, 0);
          return (
            <ResizeHandle
              key={`resize-${group.id}`}
              style={{ left: `${leftPos}%` }}
              onResize={(delta) => handleResize(index, delta)}
            />
          );
        })}

      {/* All terminals - rendered in a SINGLE container with stable sessionId keys */}
      {/* This container is NOT inside any worktree-specific wrapper, ensuring stable mounting */}
      {/* All sessions across ALL repos are rendered here to keep them mounted */}
      {/* bottom is dynamically set based on StatusLine height */}
      <div
        className="absolute top-2 left-2 right-2 z-0"
        style={{ bottom: maxStatusLineHeight + 8 }}
      >
        {Array.from(globalSessionIds).map((sessionId) => {
          const session = allSessions.find((s) => s.id === sessionId);
          if (!session) return null;

          // Check if this session belongs to current repo
          const isCurrentRepo = session.repoPath === repoPath;

          // Find session's group info for positioning
          const info = findSessionInfo(sessionId);

          // Determine if this session belongs to current worktree
          const isCurrentWorktree = isCurrentRepo && pathsEqual(session.cwd, cwd);

          // Calculate position - if no group info, use full width
          let left = 0;
          let width = 100;
          let isSessionVisible = true;
          let groupId: string | null = null;

          if (info) {
            const positions = getGroupPositions(info.state);
            const position = positions[info.groupIndex];
            if (position) {
              left = position.left;
              width = position.width;
            }
            isSessionVisible = info.group.activeSessionId === sessionId;
            groupId = info.group.id;
          }

          const isGroupActive = groupId === currentGroupState.activeGroupId;
          const isTerminalActive =
            isActive && isCurrentWorktree && isSessionVisible && isGroupActive;

          // Only show terminals from current repo + current worktree + active session
          const shouldShow = isCurrentRepo && isCurrentWorktree && isSessionVisible;

          return (
            <div
              key={sessionId}
              id={buildSessionPanelDomId(sessionId)}
              className={
                shouldShow ? 'absolute h-full' : 'absolute h-full opacity-0 pointer-events-none'
              }
              style={{
                left: `${left}%`,
                width: `${width}%`,
              }}
            >
              {/* Inactive overlay - like TerminalGroup */}
              {shouldShow && !isGroupActive && (
                <div className="absolute inset-0 z-10 bg-background/10 pointer-events-none" />
              )}
              <AgentTerminal
                id={session.id}
                cwd={session.cwd}
                sessionId={session.sessionId || session.id}
                backendSessionId={session.backendSessionId}
                agentId={session.agentId}
                agentCommand={session.agentCommand || 'claude'}
                customPath={session.customPath}
                customArgs={session.customArgs}
                environment={session.environment || 'native'}
                initialized={session.initialized}
                activated={session.activated}
                persistenceEnabled={session.persistenceEnabled}
                isActive={isTerminalActive}
                hasPendingCommand={!!session.pendingCommand}
                initialPrompt={session.pendingCommand}
                onInitialized={() => handleInitialized(sessionId)}
                onActivated={() => handleActivated(sessionId)}
                onActivatedWithFirstLine={(line) => handleActivatedWithFirstLine(sessionId, line)}
                onExit={() => handleSessionExit(sessionId, groupId || undefined)}
                onTerminalTitleChange={(title) => {
                  if (session.userRenamed) return;
                  const syncName =
                    title &&
                    isCursorAgent(session.agentId) &&
                    session.name === getDefaultSessionName(session.agentId);
                  updateSession(sessionId, {
                    terminalTitle: title,
                    ...(syncName ? { name: title } : {}),
                  });
                }}
                onBackendSessionIdChange={(backendSessionId) => {
                  if (session.backendSessionId === backendSessionId) return;
                  updateSession(sessionId, { backendSessionId });
                }}
                onRuntimeStateChange={(runtimeState) => {
                  if (session.recoveryState === runtimeState) return;
                  updateSession(sessionId, { recoveryState: runtimeState });
                }}
                onSplit={() => groupId && handleSplit(groupId)}
                canMerge={info ? info.groupIndex > 0 : false}
                onMerge={() => groupId && handleMerge(groupId)}
                onFocus={() => groupId && handleSelectSession(sessionId, groupId)}
                enhancedInputOpen={getEnhancedInputState(sessionId).open}
                onEnhancedInputOpenChange={(open) => {
                  // EnhancedInput open state is now stored per-session in the store
                  setEnhancedInputOpen(sessionId, open);
                }}
                onRegisterEnhancedInputSender={(senderSessionId, sender) => {
                  enhancedInputSenderRef.current.set(senderSessionId, sender);
                }}
                onUnregisterEnhancedInputSender={(senderSessionId) => {
                  enhancedInputSenderRef.current.delete(senderSessionId);
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Session bars (floating) - rendered for each group in current worktree */}
      {/* pointer-events-none on container, AgentGroup handles its own pointer-events */}
      {currentGroupState.groups.map((group, index) => {
        const position = currentGroupPositions[index];
        if (!position) return null;

        const isActiveGroup = group.id === activeGroupId;
        const activeSession =
          group.activeSessionId != null
            ? (currentWorktreeSessions.find((session) => session.id === group.activeSessionId) ??
              null)
            : null;
        const activeSessionAvailability = resolveAgentInputAvailability({
          backendSessionId: activeSession?.backendSessionId,
          runtimeState: activeSession?.recoveryState,
        });
        const canSendToActiveSession = activeSessionAvailability === 'ready';
        const activeSessionSendLabel =
          activeSessionAvailability === 'awaiting-session'
            ? t('Awaiting Session')
            : activeSessionAvailability === 'reconnecting'
              ? t('Reconnecting')
              : activeSessionAvailability === 'disconnected'
                ? t('Disconnected')
                : t('Send');
        const activeSessionSendHint =
          activeSession == null
            ? undefined
            : resolveAgentInputUnavailableReason({
                agentCommand: activeSession.agentCommand || 'claude',
                availability: activeSessionAvailability,
                isRemoteExecution: isRemoteVirtualPath(activeSession.cwd),
                t,
              });
        const sender =
          isActiveGroup && group.activeSessionId
            ? enhancedInputSenderRef.current.get(group.activeSessionId)
            : undefined;

        return (
          <div
            key={`group-ui-${group.id}`}
            className="absolute top-0 bottom-0 z-10 pointer-events-none overflow-hidden flex flex-col"
            style={{
              left: `${position.left}%`,
              width: `${position.width}%`,
            }}
          >
            <AgentGroup
              group={group}
              sessions={currentWorktreeSessions}
              enabledAgents={enabledAgents}
              customAgents={customAgents}
              agentSettings={agentSettings}
              agentInfo={AGENT_INFO}
              onSessionSelect={(id) => handleSelectSession(id, group.id)}
              onSessionClose={(id) => handleCloseSession(id, group.id)}
              onSessionNew={() => handleNewSession(group.id)}
              onSessionNewWithAgent={(agentId, cmd) =>
                handleNewSessionWithAgent(agentId, cmd, group.id)
              }
              onSessionRename={handleRenameSession}
              onSessionReorder={(from, to) => handleReorderSessions(group.id, from, to)}
              onGroupClick={() => handleGroupClick(group.id)}
              quickTerminalOpen={quickTerminalOpen}
              quickTerminalHasProcess={hasRunningProcess}
              onToggleQuickTerminal={quickTerminalEnabled ? handleToggleQuickTerminal : undefined}
            />
            {/* Bottom bar: Enhanced Input + Status Line, height measured for terminal offset */}
            <GroupBottomBar groupId={group.id} onHeightChange={setStatusLineHeightsByGroupId}>
              {isActiveGroup &&
                claudeCodeIntegration.enhancedInputEnabled &&
                activeSession != null &&
                !supportsAgentNativeTerminalInput(activeSession.agentId) && (
                  <EnhancedInputContainer
                    sessionId={activeSession.id}
                    canSend={canSendToActiveSession}
                    sendLabel={activeSessionSendLabel}
                    sendHint={activeSessionSendHint}
                    onSend={(content, attachments) => {
                      return sender?.(content, attachments) ?? false;
                    }}
                    isActive={isActive}
                  />
                )}
              {statusLineEnabled && (
                <StatusLine
                  sessionId={group.activeSessionId}
                  onRequestFreshSession={
                    activeSession
                      ? () => handleStartFreshSession(activeSession, group.id)
                      : undefined
                  }
                />
              )}
            </GroupBottomBar>
          </div>
        );
      })}
      <AgentCloseSessionDialog
        pendingCloseSession={pendingCloseSession}
        onConfirm={handleConfirmCloseSession}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCloseSession(null);
          }
        }}
      />
      {/* Quick Terminal Modal - 始终挂载以保持 terminal 运行状态 */}
      {quickTerminalEnabled && (
        <QuickTerminalModal
          key={`quick-terminal-${quickTerminalMountKey}`}
          open={quickTerminalOpen && isActive}
          onOpenChange={handleQuickTerminalOpenChange}
          onClose={handleCloseQuickTerminal}
          cwd={cwd}
          backendSessionId={currentQuickTerminalSession}
          onSessionInit={handleQuickTerminalSessionInit}
        />
      )}
    </div>
  );
}
