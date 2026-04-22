import type {
  AIProvider,
  ClaudePolicyConfig,
  LiveAgentSubagent,
  PersistentAgentSessionRecord,
} from '@shared/types';
import { supportsAgentCapabilityPolicyLaunch } from '@shared/utils/agentCapabilityPolicy';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { resolveTmuxServerNameForPersistentAgentHostSessionKey } from '@shared/utils/runtimeIdentity';
import {
  Bot,
  Braces,
  ChevronDown,
  Crosshair,
  Diamond,
  Lock,
  LockOpen,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Plus,
  Settings,
  Sparkles,
  SquareTerminal,
  Terminal,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  Fragment,
  memo,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/shallow';
import { TEMP_REPO_ID } from '@/App/constants';
import { normalizePath, pathsEqual } from '@/App/storage';
import { ResizeHandle } from '@/components/terminal/ResizeHandle';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import { toastManager } from '@/components/ui/toast';
import { areLiveSubagentListsEqual, useLiveSubagents } from '@/hooks/useLiveSubagents';
import { useSessionSubagentsBySession } from '@/hooks/useSessionSubagentsBySession';
import { useI18n } from '@/i18n';
import {
  isSessionPersistable,
  isSessionPersistenceEnabledForHost,
} from '@/lib/agentSessionPersistence';
import { getRendererEnvironment } from '@/lib/electronEnvironment';
import { pauseFocusLock, restoreFocusIfLocked } from '@/lib/focusLock';
import { defaultDarkTheme, getXtermTheme } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useAgentStatusStore } from '@/stores/agentStatus';
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
import { SessionSubagentInspector } from './agent-panel/SessionSubagentInspector';
import { SessionSubagentTriggerButton } from './agent-panel/SessionSubagentTriggerButton';
import type { AgentAttachmentItem } from './agentAttachmentTrayModel';
import {
  probeRemoteAgentAvailability,
  resolvePersistedInstalledAgents,
  resolveRemoteInstalledAgents,
} from './agentAvailability';
import {
  AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE,
  AGENT_CANVAS_SESSION_PANEL_ATTRIBUTE,
  shouldStartAgentCanvasPan,
} from './agentCanvasInteractionPolicy';
import {
  AGENT_CANVAS_GRID_COLUMN_UNITS,
  resolveAgentCanvasColumnCount,
  resolveAgentCanvasTileColumnSpan,
} from './agentCanvasLayout';
import {
  AGENT_CANVAS_ZOOM_DEFAULT,
  AGENT_CANVAS_ZOOM_MAX,
  AGENT_CANVAS_ZOOM_MIN,
  type AgentCanvasFocusTarget,
  clampAgentCanvasScrollPosition,
  formatAgentCanvasZoomPercent,
  resolveAgentCanvasCenteredScrollPosition,
  resolveAgentCanvasFloatingFrame,
  resolveAgentCanvasFloatingTerminalFontScale,
  resolveAgentCanvasFocusScrollPosition,
  resolveAgentCanvasScrollBehavior,
  resolveAgentCanvasViewportMetrics,
  resolveAgentCanvasViewportSyncPosition,
  resolveAgentCanvasWheelZoomDelta,
  resolveAgentCanvasZoomScrollPosition,
  resolveAgentCanvasZoomTerminalFontScale,
  stepAgentCanvasZoom,
  stepAgentCanvasZoomByDelta,
} from './agentCanvasViewport';
import { buildAgentEmptyStateModel } from './agentEmptyStateModel';
import {
  resolveAgentInputAvailability,
  resolveAgentInputUnavailableReason,
} from './agentInputAvailability';
import { supportsAgentNativeTerminalInput } from './agentInputMode';
import { collectMountedAgentSessionIds } from './agentPanelMountPolicy';
import {
  buildAgentSessionPlacementIndex,
  resolveAgentGroupPositions,
} from './agentSessionLayoutIndex';
import { diffPersistentAgentSessionRecords } from './agentSessionPersistenceSync';
import { restoreWorktreeAgentSessions } from './agentSessionRecovery';
import { matchesAgentSessionRepoPath, matchesAgentSessionScope } from './agentSessionScope';
import { findAutoSessionRolloverTarget } from './autoSessionRolloverPolicy';
import { ClaudeSessionLaunchDialog } from './ClaudeSessionLaunchDialog';
import { EnhancedInputContainer } from './EnhancedInputContainer';
import { clearGroupBottomBarHeight, setGroupBottomBarHeight } from './groupBottomBarHeightState';
import { resolveSessionPersistentHostSessionKey } from './persistentHostSession';
import { QuickTerminalModal } from './QuickTerminalModal';
import type { Session } from './SessionBar';
import { SessionPersistenceNotice } from './SessionPersistenceNotice';
import { StatusLine } from './StatusLine';
import {
  buildSessionActivityStateBySessionId,
  getHighestSessionActivityState,
} from './sessionActivityState';
import { buildSessionHandoffPrompt } from './sessionHandoffPrompt';
import { shouldShowSessionPersistenceNotice } from './sessionPersistenceNoticePolicy';
import {
  getMatchedSessionSubagents,
  resolveSessionSubagentViewState,
  supportsSessionSubagentTracking,
} from './sessionSubagentState';
import { resolveSessionTitleFromFirstInput } from './sessionTitlePolicy';
import {
  getDefaultSessionName,
  getMeaningfulTerminalTitle,
  getStoredSessionName,
  normalizeSessionTitleText,
} from './sessionTitleText';
import type { AgentGroupState, AgentGroup as AgentGroupType } from './types';
import { createInitialGroupState } from './types';
import { useAgentCanvasViewportRestore } from './useAgentCanvasViewportRestore';

export interface AgentPanelProps {
  repoPath: string; // repository path (workspace identifier)
  cwd: string; // current worktree path
  isActive?: boolean;
  canvasRecenterOnActivateToken?: number;
  canvasFocusOnActivateToken?: number;
  canvasFocusSessionId?: string | null;
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

interface SessionLaunchPolicyDialogState {
  agentId: string;
  agentCommand: string;
  agentLabel: string;
  targetGroupId?: string;
  initialPolicy?: ClaudePolicyConfig | null;
}

function buildPersistentRecord(session: Session): PersistentAgentSessionRecord {
  const { platform, runtimeChannel } = getRendererEnvironment();
  const isWindows = platform === 'win32';
  const createdAt = session.createdAt ?? Date.now();
  const hostSessionKey = resolveSessionPersistentHostSessionKey({
    session,
    platform,
    runtimeChannel,
  });

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
    displayName: getStoredSessionName(session.name, session.agentId),
    activated: Boolean(session.activated),
    initialized: session.initialized,
    hostKind: isWindows ? 'supervisor' : 'tmux',
    hostSessionKey,
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

function resolveAgentBaseId(agentId: string): string {
  if (agentId.endsWith('-hapi')) {
    return agentId.slice(0, -5);
  }
  if (agentId.endsWith('-happy')) {
    return agentId.slice(0, -6);
  }
  return agentId;
}

function renderAgentLabelIcon(agentId: string) {
  const baseId = resolveAgentBaseId(agentId);

  switch (baseId) {
    case 'claude':
      return <Sparkles className="h-3.5 w-3.5 shrink-0" />;
    case 'codex':
      return <Braces className="h-3.5 w-3.5 shrink-0" />;
    case 'gemini':
      return <Diamond className="h-3.5 w-3.5 shrink-0" />;
    case 'cursor':
      return <MousePointer2 className="h-3.5 w-3.5 shrink-0" />;
    case 'opencode':
      return <SquareTerminal className="h-3.5 w-3.5 shrink-0" />;
    case 'auggie':
      return <WandSparkles className="h-3.5 w-3.5 shrink-0" />;
    default:
      return <Bot className="h-3.5 w-3.5 shrink-0" />;
  }
}

function buildSessionPanelDomId(sessionId: string): string {
  return `agent-session-panel-${sessionId}`;
}

type CanvasPanState = {
  captureElement: HTMLDivElement | null;
  frameId: number | null;
  pendingClientX: number;
  pendingClientY: number;
  pointerId: number | null;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
};

type CanvasViewportPosition = {
  left: number;
  top: number;
};

type CanvasViewportSnapshot = {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollWidth: number;
};

type SelectSessionOptions = {
  focusCanvasViewport?: boolean;
};

type CanvasWheelZoomState = {
  frameId: number | null;
  pendingDelta: number;
};

function createInitialCanvasPanState(): CanvasPanState {
  return {
    captureElement: null,
    frameId: null,
    pendingClientX: 0,
    pendingClientY: 0,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  };
}

function createInitialCanvasWheelZoomState(): CanvasWheelZoomState {
  return {
    frameId: null,
    pendingDelta: 0,
  };
}

function readCanvasViewportSnapshot(viewport: HTMLDivElement): CanvasViewportSnapshot {
  return {
    clientHeight: viewport.clientHeight,
    clientWidth: viewport.clientWidth,
    scrollHeight: viewport.scrollHeight,
    scrollWidth: viewport.scrollWidth,
  };
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
      onHeightChange((prev) => setGroupBottomBarHeight(prev, groupId, height));
    };

    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => {
      observer.disconnect();
      onHeightChange((prev) => clearGroupBottomBarHeight(prev, groupId));
    };
  }, [groupId, onHeightChange]);

  return (
    <div ref={ref} className="mt-auto pointer-events-auto">
      {children}
    </div>
  );
});

const CanvasSessionContentOutlet = memo(function CanvasSessionContentOutlet({
  className,
  hostElement,
}: {
  className?: string;
  hostElement: HTMLDivElement | null;
}) {
  const outletRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outletElement = outletRef.current;
    if (!outletElement || !hostElement) {
      return;
    }

    if (hostElement.parentElement !== outletElement) {
      outletElement.replaceChildren(hostElement);
    }

    return () => {
      if (hostElement.parentElement === outletElement) {
        outletElement.replaceChildren();
      }
    };
  }, [hostElement]);

  return <div ref={outletRef} className={className} />;
});

export function AgentPanel({
  repoPath,
  cwd,
  isActive = false,
  canvasRecenterOnActivateToken = 0,
  canvasFocusOnActivateToken = 0,
  canvasFocusSessionId = null,
}: AgentPanelProps) {
  const { t } = useI18n();
  const platform = getRendererEnvironment().platform;
  const isWindows = platform === 'win32';
  const panelRef = useRef<HTMLDivElement>(null); // 容器引用
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const canvasPanStateRef = useRef<CanvasPanState>(createInitialCanvasPanState());
  const canvasWheelZoomStateRef = useRef<CanvasWheelZoomState>(createInitialCanvasWheelZoomState());
  const canvasSessionContentHostByIdRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const canvasViewportPositionByWorktreeRef = useRef<Record<string, CanvasViewportPosition>>({});
  const canvasViewportSnapshotByWorktreeRef = useRef<Record<string, CanvasViewportSnapshot>>({});
  const canvasViewportRestoreReadyWorktreeKeyRef = useRef<string | null>(null);
  const lastHandledCanvasFocusRequestTokenRef = useRef<number | null>(null);
  const lastCanvasZoomStorageKeyRef = useRef<string | null>(null);
  const lastCanvasZoomByWorktreeRef = useRef<Record<string, number>>({});
  const spacePressedRef = useRef(false);
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
    agentSessionDisplayMode,
    backgroundImageEnabled,
    confirmBeforeClosingAgentSession,
    quickTerminalEnabled,
    quickTerminalOpen,
    setClaudeCodeIntegration,
    setQuickTerminalOpen,
  } = useSettingsStore(
    useShallow((state) => ({
      agentSettings: state.agentSettings,
      agentDetectionStatus: state.agentDetectionStatus,
      customAgents: state.customAgents,
      xtermKeybindings: state.xtermKeybindings,
      hapiSettings: state.hapiSettings,
      autoCreateSessionOnActivate: state.autoCreateSessionOnActivate,
      autoCreateSessionOnTempActivate: state.autoCreateSessionOnTempActivate,
      claudeCodeIntegration: state.claudeCodeIntegration,
      terminalTheme: state.terminalTheme,
      fontFamily: state.fontFamily,
      fontSize: state.fontSize,
      editorSettings: state.editorSettings,
      agentSessionDisplayMode: state.agentSessionDisplayMode,
      backgroundImageEnabled: state.backgroundImageEnabled,
      confirmBeforeClosingAgentSession: state.confirmBeforeClosingAgentSession,
      quickTerminalEnabled: state.quickTerminal.enabled ?? true,
      quickTerminalOpen: state.quickTerminal.isOpen,
      setClaudeCodeIntegration: state.setClaudeCodeIntegration,
      setQuickTerminalOpen: state.setQuickTerminalOpen,
    }))
  );
  const { getQuickTerminalSession, setQuickTerminalSession, removeQuickTerminalSession } =
    useTerminalStore();
  const currentQuickTerminalSession = getQuickTerminalSession(cwd);
  const [tmuxInstalled, setTmuxInstalled] = useState<boolean | null>(null);
  const [isEnablingSessionPersistence, setIsEnablingSessionPersistence] = useState(false);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);

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

  const terminalBgColor = useMemo(() => {
    if (backgroundImageEnabled) return 'transparent';
    return getXtermTheme(terminalTheme)?.background ?? defaultDarkTheme.background;
  }, [backgroundImageEnabled, terminalTheme]);
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
  const [sessionLaunchPolicyDialog, setSessionLaunchPolicyDialog] =
    useState<SessionLaunchPolicyDialogState | null>(null);
  const autoRolledOverSessionIdsRef = useRef<Set<string>>(new Set());
  const persistentRecordSnapshotBySessionIdRef = useRef<Map<string, string>>(new Map());
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
  const [openSessionSubagentInspectorId, setOpenSessionSubagentInspectorId] = useState<
    string | null
  >(null);
  const [selectedSubagentThreadIdBySessionId, setSelectedSubagentThreadIdBySessionId] = useState<
    Record<string, string | null>
  >({});
  const [inspectorSubagentsBySessionId, setInspectorSubagentsBySessionId] = useState<
    Record<string, LiveAgentSubagent[]>
  >({});
  const subagentInspectorDisplayModeRef = useRef(agentSessionDisplayMode);

  // Keep the inspector scoped to the currently active session layout mode.
  useEffect(() => {
    if (subagentInspectorDisplayModeRef.current === agentSessionDisplayMode) {
      return;
    }

    subagentInspectorDisplayModeRef.current = agentSessionDisplayMode;
    setOpenSessionSubagentInspectorId(null);
  }, [agentSessionDisplayMode]);

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
  const markSessionExited = useAgentSessionsStore((state) => state.markSessionExited);
  const setActiveId = useAgentSessionsStore((state) => state.setActiveId);
  const sessionRuntimeStates = useAgentSessionsStore((state) => state.runtimeStates);
  const setDerivedActivityState = useWorktreeActivityStore(
    (state) => state.setDerivedActivityState
  );
  const clearDerivedActivityState = useWorktreeActivityStore(
    (state) => state.clearDerivedActivityState
  );
  const persistableSessions = useMemo(
    () => allSessions.filter((session) => isSessionPersistable(session)),
    [allSessions]
  );

  // Enhanced input state actions from store
  const setEnhancedInputOpen = useAgentSessionsStore((state) => state.setEnhancedInputOpen);
  const getEnhancedInputState = useAgentSessionsStore((state) => state.getEnhancedInputState);
  const shouldRenderEnhancedInput = useCallback(
    (sessionId: string) => {
      const session = allSessions.find((item) => item.id === sessionId);
      if (!session || supportsAgentNativeTerminalInput(session.agentId)) {
        return false;
      }
      const inputState = getEnhancedInputState(sessionId);
      return (
        claudeCodeIntegration.enhancedInputEnabled ||
        inputState.open ||
        inputState.attachments.length > 0
      );
    },
    [allSessions, claudeCodeIntegration.enhancedInputEnabled, getEnhancedInputState]
  );

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
  const persistedActiveSessionId = useAgentSessionsStore(
    (state) => state.activeIds[normalizePath(cwd)] ?? null
  );

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

  const ensureCanvasSessionContentHost = useCallback((sessionId: string): HTMLDivElement | null => {
    if (typeof document === 'undefined') {
      return null;
    }

    const existingHost = canvasSessionContentHostByIdRef.current.get(sessionId);
    if (existingHost) {
      return existingHost;
    }

    const nextHost = document.createElement('div');
    nextHost.className = 'h-full w-full';
    nextHost.dataset.agentCanvasContentHost = sessionId;
    canvasSessionContentHostByIdRef.current.set(sessionId, nextHost);
    return nextHost;
  }, []);

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

  useEffect(() => {
    const activeSessionIds = new Set(allSessions.map((session) => session.id));
    for (const [sessionId, hostElement] of canvasSessionContentHostByIdRef.current) {
      if (activeSessionIds.has(sessionId)) {
        continue;
      }

      hostElement.remove();
      canvasSessionContentHostByIdRef.current.delete(sessionId);
    }
  }, [allSessions]);

  useEffect(() => {
    return () => {
      for (const hostElement of canvasSessionContentHostByIdRef.current.values()) {
        hostElement.remove();
      }
      canvasSessionContentHostByIdRef.current.clear();
    };
  }, []);

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
      .filter((session) => matchesAgentSessionScope(session, repoPath, cwd))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [allSessions, repoPath, cwd]);
  const currentWorktreeSessionIds = useMemo(
    () => currentWorktreeSessions.map((session) => session.id),
    [currentWorktreeSessions]
  );
  const sessionSubagentViewStateBySessionId = useMemo(() => {
    return Object.fromEntries(
      currentWorktreeSessions.map((session) => [
        session.id,
        resolveSessionSubagentViewState({
          agentId: session.agentId,
          agentCommand: session.agentCommand,
          initialized: session.initialized,
          uiSessionId: session.id,
          providerSessionId: session.sessionId,
          isRemoteExecution: isRemoteVirtualPath(session.cwd),
        }),
      ])
    );
  }, [currentWorktreeSessions]);
  const shouldPollSessionSubagents =
    isActive &&
    currentWorktreeSessions.some(
      (session) => sessionSubagentViewStateBySessionId[session.id]?.kind === 'supported'
    );
  const sessionSubagentPollTargets = useMemo(
    () =>
      currentWorktreeSessions.map((session) => ({
        sessionId: session.id,
        cwd: session.cwd,
        providerSessionId: session.sessionId,
        enabled: sessionSubagentViewStateBySessionId[session.id]?.kind === 'supported',
      })),
    [currentWorktreeSessions, sessionSubagentViewStateBySessionId]
  );
  const { itemsBySessionId: sessionScopedSubagentsBySessionId } = useSessionSubagentsBySession({
    enabled: shouldPollSessionSubagents,
    targets: sessionSubagentPollTargets,
  });
  useEffect(() => {
    const activeSessionIdSet = new Set(currentWorktreeSessionIds);

    setOpenSessionSubagentInspectorId((current) =>
      current && activeSessionIdSet.has(current) ? current : null
    );
    setSelectedSubagentThreadIdBySessionId((current) => {
      let changed = false;
      const next: Record<string, string | null> = {};

      for (const [sessionId, threadId] of Object.entries(current)) {
        if (!activeSessionIdSet.has(sessionId)) {
          changed = true;
          continue;
        }

        next[sessionId] = threadId;
      }

      return changed ? next : current;
    });
    setInspectorSubagentsBySessionId((current) => {
      let changed = false;
      const next: Record<string, LiveAgentSubagent[]> = {};

      for (const [sessionId, subagents] of Object.entries(current)) {
        if (!activeSessionIdSet.has(sessionId)) {
          changed = true;
          continue;
        }

        next[sessionId] = subagents;
      }

      return changed ? next : current;
    });
  }, [currentWorktreeSessionIds]);
  const handleSessionInspectorSubagentsChange = useCallback(
    (sessionId: string, subagents: LiveAgentSubagent[]) => {
      setInspectorSubagentsBySessionId((current) => {
        const existing = current[sessionId];
        const hasExisting = Array.isArray(existing);

        if (!hasExisting && subagents.length === 0) {
          return current;
        }

        if (hasExisting && areLiveSubagentListsEqual(existing, subagents)) {
          return current;
        }

        const next = { ...current };
        if (subagents.length === 0) {
          delete next[sessionId];
        } else {
          next[sessionId] = subagents;
        }

        return next;
      });
    },
    []
  );
  const currentGroupIdBySessionId = useMemo(() => {
    const groupIds = new Map<string, string>();
    for (const group of currentGroupState.groups) {
      for (const sessionId of group.sessionIds) {
        groupIds.set(sessionId, group.id);
      }
    }
    return groupIds;
  }, [currentGroupState.groups]);
  const canvasFocusedSessionId = useMemo(() => {
    if (
      persistedActiveSessionId &&
      currentWorktreeSessions.some((session) => session.id === persistedActiveSessionId)
    ) {
      return persistedActiveSessionId;
    }

    const groupActiveSessionId = getCurrentActiveSessionId();
    if (
      groupActiveSessionId &&
      currentWorktreeSessions.some((session) => session.id === groupActiveSessionId)
    ) {
      return groupActiveSessionId;
    }

    return currentWorktreeSessions[0]?.id ?? null;
  }, [currentWorktreeSessions, getCurrentActiveSessionId, persistedActiveSessionId]);
  const [canvasZoomByWorktree, setCanvasZoomByWorktree] = useState<Record<string, number>>({});
  const [canvasLockedByWorktree, setCanvasLockedByWorktree] = useState<Record<string, boolean>>({});
  const [canvasFloatingSessionIdByWorktree, setCanvasFloatingSessionIdByWorktree] = useState<
    Record<string, string | null>
  >({});
  const [canvasViewportBounds, setCanvasViewportBounds] = useState<{
    height: number;
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [canvasViewportWidth, setCanvasViewportWidth] = useState<number | null>(null);
  const canvasColumnCount = useMemo(
    () => resolveAgentCanvasColumnCount(currentWorktreeSessions.length, canvasViewportWidth),
    [canvasViewportWidth, currentWorktreeSessions.length]
  );
  const canvasTileColumnSpanBySessionId = useMemo(() => {
    const spans = new Map<string, number>();
    currentWorktreeSessions.forEach((session, index) => {
      spans.set(
        session.id,
        resolveAgentCanvasTileColumnSpan(currentWorktreeSessions.length, index, canvasColumnCount)
      );
    });
    return spans;
  }, [canvasColumnCount, currentWorktreeSessions]);
  const canvasZoomStorageKey = useMemo(() => normalizePath(cwd), [cwd]);
  const canvasZoom = useMemo(
    () => canvasZoomByWorktree[canvasZoomStorageKey] ?? AGENT_CANVAS_ZOOM_DEFAULT,
    [canvasZoomByWorktree, canvasZoomStorageKey]
  );
  const canvasFloatingSessionId = useMemo(
    () => canvasFloatingSessionIdByWorktree[canvasZoomStorageKey] ?? null,
    [canvasFloatingSessionIdByWorktree, canvasZoomStorageKey]
  );
  const isCanvasLocked = useMemo(
    () => canvasLockedByWorktree[canvasZoomStorageKey] ?? false,
    [canvasLockedByWorktree, canvasZoomStorageKey]
  );
  const canvasZoomLabel = useMemo(() => formatAgentCanvasZoomPercent(canvasZoom), [canvasZoom]);
  const canvasViewportMetrics = useMemo(
    () => resolveAgentCanvasViewportMetrics(canvasZoom),
    [canvasZoom]
  );
  const canvasFloatingFrame = useMemo(
    () =>
      canvasViewportBounds
        ? resolveAgentCanvasFloatingFrame({
            viewportHeight: canvasViewportBounds.height,
            viewportLeft: canvasViewportBounds.left,
            viewportTop: canvasViewportBounds.top,
            viewportWidth: canvasViewportBounds.width,
          })
        : null,
    [canvasViewportBounds]
  );
  const canvasFloatingTerminalFontScale = useMemo(() => {
    if (!canvasFloatingFrame) {
      return 1;
    }

    return resolveAgentCanvasFloatingTerminalFontScale({
      frameHeight: canvasFloatingFrame.height,
      frameWidth: canvasFloatingFrame.width,
    });
  }, [canvasFloatingFrame]);
  const canvasZoomTerminalFontScale = useMemo(
    () => resolveAgentCanvasZoomTerminalFontScale(canvasZoom),
    [canvasZoom]
  );
  const isCanvasDisplayMode = agentSessionDisplayMode === 'canvas';
  const shouldPollLiveSubagents =
    isActive &&
    currentWorktreeSessions.some((session) =>
      supportsSessionSubagentTracking(session.agentId, session.agentCommand)
    );
  const liveSubagentsByWorktree = useLiveSubagents(shouldPollLiveSubagents ? [cwd] : []);
  const sessionActivityStateById = useMemo(
    () =>
      buildSessionActivityStateBySessionId({
        sessions: currentWorktreeSessions,
        runtimeStates: sessionRuntimeStates,
        subagentsByWorktree: liveSubagentsByWorktree,
      }),
    [currentWorktreeSessions, liveSubagentsByWorktree, sessionRuntimeStates]
  );
  const derivedWorktreeActivityState = useMemo(
    () => getHighestSessionActivityState(Object.values(sessionActivityStateById)),
    [sessionActivityStateById]
  );
  const currentWorktreeAgentStatuses = useAgentStatusStore(
    useShallow((state) => {
      const nextStatuses: typeof state.statuses = {};

      for (const sessionId of currentWorktreeSessionIds) {
        const status = state.statuses[sessionId];
        if (status) {
          nextStatuses[sessionId] = status;
        }
      }

      return nextStatuses;
    })
  );

  useEffect(() => {
    if (!cwd) {
      return undefined;
    }

    setDerivedActivityState(cwd, derivedWorktreeActivityState);
    return () => {
      clearDerivedActivityState(cwd);
    };
  }, [clearDerivedActivityState, cwd, derivedWorktreeActivityState, setDerivedActivityState]);

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

    const { platform, runtimeChannel } = getRendererEnvironment();
    if (platform !== 'win32') {
      const hostSessionKey = resolveSessionPersistentHostSessionKey({
        session,
        platform,
        runtimeChannel,
      });
      const serverName = resolveTmuxServerNameForPersistentAgentHostSessionKey(
        hostSessionKey,
        runtimeChannel
      );
      void window.electronAPI.tmux
        .killSession(session.cwd, { name: hostSessionKey, serverName })
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

  const cleanupRemovedPersistentRecord = useCallback((record: PersistentAgentSessionRecord) => {
    const { runtimeChannel } = getRendererEnvironment();

    if (record.hostKind === 'tmux') {
      const serverName = resolveTmuxServerNameForPersistentAgentHostSessionKey(
        record.hostSessionKey,
        runtimeChannel
      );
      void window.electronAPI.tmux
        .killSession(record.cwd, { name: record.hostSessionKey, serverName })
        .catch(() => {});
    }

    if (!record.backendSessionId) {
      return;
    }

    void window.electronAPI.session.kill(record.backendSessionId).catch((error) => {
      console.error(
        `[AgentPanel] Failed to kill removed backend session ${record.backendSessionId}`,
        error
      );
    });
  }, []);

  useEffect(() => {
    const records = persistableSessions.map((session) => buildPersistentRecord(session));
    const { changedRecords, removedRecords, removedSessionIds, nextSnapshotBySessionId } =
      diffPersistentAgentSessionRecords({
        previousSnapshotBySessionId: persistentRecordSnapshotBySessionIdRef.current,
        records,
      });

    persistentRecordSnapshotBySessionIdRef.current = nextSnapshotBySessionId;
    if (changedRecords.length === 0 && removedSessionIds.length === 0) {
      return;
    }

    const removedRecordIds = new Set(removedRecords.map((record) => record.uiSessionId));
    void Promise.allSettled([
      ...changedRecords.map((record) => window.electronAPI.agentSession.markPersistent(record)),
      ...removedRecords.map(async (record) => {
        cleanupRemovedPersistentRecord(record);
        return window.electronAPI.agentSession.abandon(record.uiSessionId);
      }),
      ...removedSessionIds.map((uiSessionId) =>
        removedRecordIds.has(uiSessionId)
          ? Promise.resolve(undefined)
          : window.electronAPI.agentSession.abandon(uiSessionId)
      ),
    ]);
  }, [cleanupRemovedPersistentRecord, persistableSessions]);

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
          !supportsAgentNativeTerminalInput(defaultAgentId) &&
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

  const handleOpenSessionLaunchOptions = useCallback(
    (agentId: string, agentCommand: string, targetGroupId?: string) => {
      setSessionLaunchPolicyDialog({
        agentId,
        agentCommand,
        agentLabel: getAgentDisplayLabel(agentId, customAgents),
        targetGroupId,
      });
    },
    [customAgents]
  );

  const handleLaunchSessionWithOptions = useCallback(
    (policy: ClaudePolicyConfig | null) => {
      if (!sessionLaunchPolicyDialog) {
        return;
      }

      handleNewSessionWithAgent(
        sessionLaunchPolicyDialog.agentId,
        sessionLaunchPolicyDialog.agentCommand,
        sessionLaunchPolicyDialog.targetGroupId,
        {
          claudeSessionPolicy: policy,
        }
      );
    },
    [handleNewSessionWithAgent, sessionLaunchPolicyDialog]
  );

  const handleStartFreshSession = useCallback(
    (session: Session, groupId: string) => {
      void (async () => {
        const status = currentWorktreeAgentStatuses[session.id];
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
    [currentWorktreeAgentStatuses, getOpenFilePathsForWorktree, handleNewSessionWithAgent]
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const target = findAutoSessionRolloverTarget({
      mode: claudeCodeIntegration.autoSessionRollover,
      groupState: currentGroupState,
      sessions: currentWorktreeSessions,
      statuses: currentWorktreeAgentStatuses,
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
    currentWorktreeAgentStatuses,
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
    (id: string, _groupId?: string) => {
      markSessionExited(id);
    },
    [markSessionExited]
  );
  const readCanvasSessionFocusTarget = useCallback(
    (
      id: string,
      viewportRect: DOMRect | Pick<DOMRect, 'left' | 'top'>
    ): AgentCanvasFocusTarget | null => {
      const viewport = canvasViewportRef.current;
      if (!viewport) {
        return null;
      }

      const sessionPanel = document.getElementById(buildSessionPanelDomId(id));
      if (!(sessionPanel instanceof HTMLElement)) {
        return null;
      }

      const sessionPanelRect = sessionPanel.getBoundingClientRect();
      if (sessionPanelRect.width <= 0 || sessionPanelRect.height <= 0) {
        return null;
      }

      return {
        height: sessionPanelRect.height,
        left: viewport.scrollLeft + sessionPanelRect.left - viewportRect.left,
        top: viewport.scrollTop + sessionPanelRect.top - viewportRect.top,
        width: sessionPanelRect.width,
      };
    },
    []
  );

  const focusCanvasViewportOnSession = useCallback(
    (id: string) => {
      if (!isCanvasDisplayMode || isCanvasLocked) {
        return;
      }

      const viewport = canvasViewportRef.current;
      if (!viewport) {
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const focusTarget = readCanvasSessionFocusTarget(id, viewportRect);
      if (!focusTarget) {
        return;
      }

      const nextPosition = resolveAgentCanvasFocusScrollPosition({
        clientHeight: viewport.clientHeight,
        clientWidth: viewport.clientWidth,
        currentScrollLeft: viewport.scrollLeft,
        currentScrollTop: viewport.scrollTop,
        scrollHeight: viewport.scrollHeight,
        scrollWidth: viewport.scrollWidth,
        targetHeight: focusTarget.height,
        targetLeft: focusTarget.left,
        targetTop: focusTarget.top,
        targetWidth: focusTarget.width,
      });
      const prefersReducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      viewport.scrollTo({
        left: nextPosition.left,
        top: nextPosition.top,
        behavior: resolveAgentCanvasScrollBehavior(prefersReducedMotion),
      });
      canvasViewportPositionByWorktreeRef.current[canvasZoomStorageKey] = nextPosition;
    },
    [canvasZoomStorageKey, isCanvasDisplayMode, isCanvasLocked, readCanvasSessionFocusTarget]
  );

  // Handle session selection
  const handleSelectSession = useCallback(
    (id: string, groupId?: string, options?: SelectSessionOptions) => {
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

      if (options?.focusCanvasViewport) {
        focusCanvasViewportOnSession(id);
      }
    },
    [cwd, focusCanvasViewportOnSession, setActiveId, updateCurrentGroupState]
  );

  // Enhanced input sender ref (unchanged)
  const enhancedInputSenderRef = useRef<
    Map<string, (content: string, attachments: AgentAttachmentItem[]) => boolean>
  >(new Map());

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
  const handleNextCanvasSession = useCallback(() => {
    if (currentWorktreeSessions.length <= 1) {
      return;
    }

    const currentIndex = currentWorktreeSessions.findIndex(
      (session) => session.id === canvasFocusedSessionId
    );
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextSession = currentWorktreeSessions[(baseIndex + 1) % currentWorktreeSessions.length];

    handleSelectSession(nextSession.id, currentGroupIdBySessionId.get(nextSession.id), {
      focusCanvasViewport: true,
    });
  }, [
    canvasFocusedSessionId,
    currentGroupIdBySessionId,
    currentWorktreeSessions,
    handleSelectSession,
  ]);
  const handlePrevCanvasSession = useCallback(() => {
    if (currentWorktreeSessions.length <= 1) {
      return;
    }

    const currentIndex = currentWorktreeSessions.findIndex(
      (session) => session.id === canvasFocusedSessionId
    );
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const prevIndex =
      baseIndex <= 0 ? currentWorktreeSessions.length - 1 : Math.max(baseIndex - 1, 0);
    const prevSession = currentWorktreeSessions[prevIndex];

    handleSelectSession(prevSession.id, currentGroupIdBySessionId.get(prevSession.id), {
      focusCanvasViewport: true,
    });
  }, [
    canvasFocusedSessionId,
    currentGroupIdBySessionId,
    currentWorktreeSessions,
    handleSelectSession,
  ]);
  const setCanvasZoomForCurrentWorktree = useCallback(
    (updater: number | ((current: number) => number)) => {
      setCanvasZoomByWorktree((prev) => {
        const current = prev[canvasZoomStorageKey] ?? AGENT_CANVAS_ZOOM_DEFAULT;
        const next = typeof updater === 'function' ? updater(current) : updater;
        const normalizedNext =
          next === AGENT_CANVAS_ZOOM_DEFAULT && prev[canvasZoomStorageKey] === undefined
            ? AGENT_CANVAS_ZOOM_DEFAULT
            : next;

        if (normalizedNext === current) {
          return prev;
        }

        return {
          ...prev,
          [canvasZoomStorageKey]: normalizedNext,
        };
      });
    },
    [canvasZoomStorageKey]
  );
  const handleCanvasZoomOut = useCallback(() => {
    if (isCanvasLocked) {
      return;
    }
    setCanvasZoomForCurrentWorktree((current) => stepAgentCanvasZoom(current, 'out'));
  }, [isCanvasLocked, setCanvasZoomForCurrentWorktree]);
  const handleCanvasZoomReset = useCallback(() => {
    if (isCanvasLocked) {
      return;
    }
    setCanvasZoomForCurrentWorktree(AGENT_CANVAS_ZOOM_DEFAULT);
  }, [isCanvasLocked, setCanvasZoomForCurrentWorktree]);
  const handleCanvasZoomIn = useCallback(() => {
    if (isCanvasLocked) {
      return;
    }
    setCanvasZoomForCurrentWorktree((current) => stepAgentCanvasZoom(current, 'in'));
  }, [isCanvasLocked, setCanvasZoomForCurrentWorktree]);
  const setCanvasLockedForCurrentWorktree = useCallback(
    (locked: boolean) => {
      setCanvasLockedByWorktree((prev) => {
        const current = prev[canvasZoomStorageKey] ?? false;
        if (current === locked) {
          return prev;
        }

        return {
          ...prev,
          [canvasZoomStorageKey]: locked,
        };
      });
    },
    [canvasZoomStorageKey]
  );
  const handleToggleCanvasLock = useCallback(() => {
    setCanvasLockedForCurrentWorktree(!isCanvasLocked);
  }, [isCanvasLocked, setCanvasLockedForCurrentWorktree]);
  const resetCanvasWheelZoomState = useCallback(() => {
    const wheelZoomState = canvasWheelZoomStateRef.current;
    if (wheelZoomState.frameId !== null) {
      cancelAnimationFrame(wheelZoomState.frameId);
    }
    canvasWheelZoomStateRef.current = createInitialCanvasWheelZoomState();
  }, []);
  const updateCanvasViewportBounds = useCallback(
    (viewport: HTMLDivElement) => {
      const rect = viewport.getBoundingClientRect();
      const nextBounds = {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };
      setCanvasViewportWidth((previousWidth) =>
        previousWidth === nextBounds.width ? previousWidth : nextBounds.width
      );
      const nextStoredBounds = canvasFloatingSessionId ? nextBounds : null;

      setCanvasViewportBounds((previousBounds) => {
        if (previousBounds === null && nextStoredBounds === null) {
          return previousBounds;
        }

        if (
          previousBounds &&
          nextStoredBounds &&
          previousBounds.height === nextStoredBounds.height &&
          previousBounds.left === nextStoredBounds.left &&
          previousBounds.top === nextStoredBounds.top &&
          previousBounds.width === nextStoredBounds.width
        ) {
          return previousBounds;
        }

        return nextStoredBounds;
      });
    },
    [canvasFloatingSessionId]
  );
  const applyCanvasViewportPosition = useCallback(
    (viewport: HTMLDivElement, position: CanvasViewportPosition): CanvasViewportPosition => {
      const snapshot = readCanvasViewportSnapshot(viewport);
      const nextPosition = clampAgentCanvasScrollPosition({
        clientHeight: snapshot.clientHeight,
        clientWidth: snapshot.clientWidth,
        left: position.left,
        scrollHeight: snapshot.scrollHeight,
        scrollWidth: snapshot.scrollWidth,
        top: position.top,
      });

      if (viewport.scrollLeft !== nextPosition.left) {
        viewport.scrollLeft = nextPosition.left;
      }
      if (viewport.scrollTop !== nextPosition.top) {
        viewport.scrollTop = nextPosition.top;
      }

      canvasViewportPositionByWorktreeRef.current[canvasZoomStorageKey] = nextPosition;
      return nextPosition;
    },
    [canvasZoomStorageKey]
  );
  const handleCenterCanvasViewport = useCallback(() => {
    if (isCanvasLocked) {
      return;
    }

    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return;
    }

    const snapshot = readCanvasViewportSnapshot(viewport);
    const nextPosition = resolveAgentCanvasCenteredScrollPosition({
      clientHeight: snapshot.clientHeight,
      clientWidth: snapshot.clientWidth,
      scrollHeight: snapshot.scrollHeight,
      scrollWidth: snapshot.scrollWidth,
    });

    applyCanvasViewportPosition(viewport, nextPosition);
    canvasViewportSnapshotByWorktreeRef.current[canvasZoomStorageKey] = snapshot;
  }, [applyCanvasViewportPosition, canvasZoomStorageKey, isCanvasLocked]);
  const handleCanvasViewportWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      event.preventDefault();
      if (isCanvasLocked) {
        return;
      }
      const wheelZoomState = canvasWheelZoomStateRef.current;
      wheelZoomState.pendingDelta += event.deltaY;

      if (wheelZoomState.frameId !== null) {
        return;
      }

      wheelZoomState.frameId = requestAnimationFrame(() => {
        const currentWheelZoomState = canvasWheelZoomStateRef.current;
        currentWheelZoomState.frameId = null;

        const { nextPendingDelta, stepDelta } = resolveAgentCanvasWheelZoomDelta(
          currentWheelZoomState.pendingDelta
        );
        currentWheelZoomState.pendingDelta = nextPendingDelta;

        if (stepDelta === 0) {
          return;
        }

        setCanvasZoomForCurrentWorktree((current) =>
          stepAgentCanvasZoomByDelta(current, stepDelta)
        );
      });
    },
    [isCanvasLocked, setCanvasZoomForCurrentWorktree]
  );
  const handleCanvasViewportScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      if (!isCanvasDisplayMode) {
        return;
      }

      if (canvasViewportRestoreReadyWorktreeKeyRef.current !== canvasZoomStorageKey) {
        return;
      }

      canvasViewportPositionByWorktreeRef.current[canvasZoomStorageKey] = {
        left: event.currentTarget.scrollLeft,
        top: event.currentTarget.scrollTop,
      };
    },
    [canvasZoomStorageKey, isCanvasDisplayMode]
  );
  const setCanvasFloatingSessionIdForCurrentWorktree = useCallback(
    (sessionId: string | null) => {
      setCanvasFloatingSessionIdByWorktree((prev) => {
        const current = prev[canvasZoomStorageKey] ?? null;
        if (current === sessionId) {
          return prev;
        }

        return {
          ...prev,
          [canvasZoomStorageKey]: sessionId,
        };
      });
    },
    [canvasZoomStorageKey]
  );
  const handleOpenCanvasFloatingSession = useCallback(
    (sessionId: string, groupId?: string) => {
      handleSelectSession(sessionId, groupId);
      setCanvasFloatingSessionIdForCurrentWorktree(sessionId);
    },
    [handleSelectSession, setCanvasFloatingSessionIdForCurrentWorktree]
  );
  const handleCloseCanvasFloatingSession = useCallback(() => {
    setCanvasFloatingSessionIdForCurrentWorktree(null);
  }, [setCanvasFloatingSessionIdForCurrentWorktree]);
  const finishCanvasPan = useCallback(() => {
    const panState = canvasPanStateRef.current;
    if (panState.pointerId === null) {
      return;
    }

    if (panState.frameId !== null) {
      cancelAnimationFrame(panState.frameId);
    }

    if (
      panState.captureElement?.isConnected &&
      panState.captureElement.hasPointerCapture(panState.pointerId)
    ) {
      panState.captureElement.releasePointerCapture(panState.pointerId);
    }

    canvasPanStateRef.current = createInitialCanvasPanState();
    setIsCanvasPanning(false);
  }, []);
  const handleCanvasViewportPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !shouldStartAgentCanvasPan({
          isCanvasDisplayMode,
          isCanvasLocked,
          pointerButton: event.button,
          spacePressed: spacePressedRef.current,
          target: event.target,
        })
      ) {
        return;
      }

      const viewport = canvasViewportRef.current;
      if (!viewport || canvasPanStateRef.current.pointerId !== null) {
        return;
      }

      canvasPanStateRef.current = {
        captureElement: event.currentTarget,
        frameId: null,
        pendingClientX: event.clientX,
        pendingClientY: event.clientY,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: viewport.scrollLeft,
        startScrollTop: viewport.scrollTop,
      };

      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      setIsCanvasPanning(true);
    },
    [isCanvasDisplayMode, isCanvasLocked]
  );
  const handleCanvasViewportPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const panState = canvasPanStateRef.current;
      if (panState.pointerId !== event.pointerId) {
        return;
      }

      panState.pendingClientX = event.clientX;
      panState.pendingClientY = event.clientY;

      if (panState.frameId !== null) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      panState.frameId = requestAnimationFrame(() => {
        const viewport = canvasViewportRef.current;
        const currentPanState = canvasPanStateRef.current;
        currentPanState.frameId = null;

        if (!viewport || currentPanState.pointerId === null) {
          return;
        }

        const deltaX = currentPanState.pendingClientX - currentPanState.startClientX;
        const deltaY = currentPanState.pendingClientY - currentPanState.startClientY;
        viewport.scrollLeft = currentPanState.startScrollLeft - deltaX;
        viewport.scrollTop = currentPanState.startScrollTop - deltaY;
      });

      event.preventDefault();
      event.stopPropagation();
    },
    []
  );
  const handleCanvasViewportPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (canvasPanStateRef.current.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      finishCanvasPan();
    },
    [finishCanvasPan]
  );
  const handleCanvasViewportPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (canvasPanStateRef.current.pointerId !== event.pointerId) {
        return;
      }

      finishCanvasPan();
    },
    [finishCanvasPan]
  );

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePressedRef.current = true;
      }
    };
    const handleWindowKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePressedRef.current = false;
      }
    };
    const handleWindowBlur = () => {
      spacePressedRef.current = false;
      finishCanvasPan();
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    window.addEventListener('keyup', handleWindowKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
      window.removeEventListener('keyup', handleWindowKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [finishCanvasPan]);

  useEffect(() => {
    return () => {
      resetCanvasWheelZoomState();
    };
  }, [resetCanvasWheelZoomState]);

  useEffect(() => {
    if (!isCanvasDisplayMode) {
      finishCanvasPan();
      resetCanvasWheelZoomState();
    }
  }, [finishCanvasPan, isCanvasDisplayMode, resetCanvasWheelZoomState]);

  useEffect(() => {
    if (!isCanvasLocked) {
      return;
    }

    finishCanvasPan();
    resetCanvasWheelZoomState();
  }, [finishCanvasPan, isCanvasLocked, resetCanvasWheelZoomState]);

  useEffect(() => {
    if (lastCanvasZoomStorageKeyRef.current === canvasZoomStorageKey) {
      return;
    }

    lastCanvasZoomStorageKeyRef.current = canvasZoomStorageKey;
    canvasViewportRestoreReadyWorktreeKeyRef.current = null;
    resetCanvasWheelZoomState();
  }, [canvasZoomStorageKey, resetCanvasWheelZoomState]);
  useEffect(() => {
    if (!isCanvasDisplayMode || !isActive) {
      return;
    }

    const previousZoom = lastCanvasZoomByWorktreeRef.current[canvasZoomStorageKey];
    lastCanvasZoomByWorktreeRef.current[canvasZoomStorageKey] = canvasZoom;

    if (previousZoom === undefined || previousZoom === canvasZoom) {
      return;
    }

    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      const viewport = canvasViewportRef.current;
      if (!viewport) {
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const focusTarget = canvasFocusedSessionId
        ? readCanvasSessionFocusTarget(canvasFocusedSessionId, viewportRect)
        : null;
      const nextPosition = resolveAgentCanvasZoomScrollPosition({
        clientHeight: viewport.clientHeight,
        clientWidth: viewport.clientWidth,
        currentLeft: viewport.scrollLeft,
        currentTop: viewport.scrollTop,
        focusTarget,
        scrollHeight: viewport.scrollHeight,
        scrollWidth: viewport.scrollWidth,
      });

      applyCanvasViewportPosition(viewport, nextPosition);
      canvasViewportSnapshotByWorktreeRef.current[canvasZoomStorageKey] =
        readCanvasViewportSnapshot(viewport);
      canvasViewportRestoreReadyWorktreeKeyRef.current = canvasZoomStorageKey;
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    applyCanvasViewportPosition,
    canvasFocusedSessionId,
    canvasZoom,
    canvasZoomStorageKey,
    isActive,
    isCanvasDisplayMode,
    readCanvasSessionFocusTarget,
  ]);

  useAgentCanvasViewportRestore({
    applyCanvasViewportPosition,
    canvasViewportPositionByWorktreeRef,
    canvasViewportRestoreReadyWorktreeKeyRef,
    canvasViewportSnapshotByWorktreeRef,
    canvasZoomStorageKey,
    isActive,
    isCanvasDisplayMode,
    readCanvasViewportSnapshot,
    recenterOnActivateToken: canvasRecenterOnActivateToken,
    viewportRef: canvasViewportRef,
  });
  useEffect(() => {
    if (
      !isCanvasDisplayMode ||
      !isActive ||
      !canvasFocusSessionId ||
      canvasFocusOnActivateToken <= 0
    ) {
      return;
    }

    if (lastHandledCanvasFocusRequestTokenRef.current === canvasFocusOnActivateToken) {
      return;
    }

    lastHandledCanvasFocusRequestTokenRef.current = canvasFocusOnActivateToken;
    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      focusCanvasViewportOnSession(canvasFocusSessionId);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    canvasFocusOnActivateToken,
    canvasFocusSessionId,
    focusCanvasViewportOnSession,
    isActive,
    isCanvasDisplayMode,
  ]);
  useEffect(() => {
    if (!isCanvasDisplayMode) {
      setCanvasViewportBounds(null);
      setCanvasViewportWidth(null);
      return;
    }

    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return;
    }

    let frameId: number | null = null;

    const syncCanvasViewportLayout = () => {
      updateCanvasViewportBounds(viewport);

      const nextSnapshot = readCanvasViewportSnapshot(viewport);
      const previousSnapshot = canvasViewportSnapshotByWorktreeRef.current[canvasZoomStorageKey];
      const savedPosition = canvasViewportPositionByWorktreeRef.current[canvasZoomStorageKey];
      const currentPosition = {
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      const viewportRect = viewport.getBoundingClientRect();
      const focusTarget =
        previousSnapshot && canvasFocusedSessionId
          ? readCanvasSessionFocusTarget(canvasFocusedSessionId, viewportRect)
          : null;

      const nextPosition = resolveAgentCanvasViewportSyncPosition({
        currentLeft: currentPosition.left,
        currentTop: currentPosition.top,
        focusTarget,
        nextClientHeight: nextSnapshot.clientHeight,
        nextClientWidth: nextSnapshot.clientWidth,
        nextScrollHeight: nextSnapshot.scrollHeight,
        nextScrollWidth: nextSnapshot.scrollWidth,
        previousSnapshot,
        savedPosition,
      });

      applyCanvasViewportPosition(viewport, nextPosition);
      canvasViewportSnapshotByWorktreeRef.current[canvasZoomStorageKey] = nextSnapshot;
      canvasViewportRestoreReadyWorktreeKeyRef.current = canvasZoomStorageKey;
    };

    const scheduleViewportLayoutSync = () => {
      if (frameId !== null) {
        return;
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        syncCanvasViewportLayout();
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      scheduleViewportLayoutSync();
    });

    scheduleViewportLayoutSync();
    resizeObserver.observe(viewport);
    window.addEventListener('resize', scheduleViewportLayoutSync);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleViewportLayoutSync);
    };
  }, [
    applyCanvasViewportPosition,
    canvasFocusedSessionId,
    canvasZoomStorageKey,
    isCanvasDisplayMode,
    readCanvasSessionFocusTarget,
    updateCanvasViewportBounds,
  ]);
  useEffect(() => {
    if (isCanvasDisplayMode) {
      return;
    }

    if (canvasFloatingSessionId !== null) {
      setCanvasFloatingSessionIdForCurrentWorktree(null);
    }
  }, [canvasFloatingSessionId, isCanvasDisplayMode, setCanvasFloatingSessionIdForCurrentWorktree]);
  useEffect(() => {
    if (
      canvasFloatingSessionId &&
      !currentWorktreeSessions.some((session) => session.id === canvasFloatingSessionId)
    ) {
      setCanvasFloatingSessionIdForCurrentWorktree(null);
    }
  }, [
    canvasFloatingSessionId,
    currentWorktreeSessions,
    setCanvasFloatingSessionIdForCurrentWorktree,
  ]);
  useEffect(() => {
    if (!canvasFloatingSessionId) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      handleCloseCanvasFloatingSession();
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [canvasFloatingSessionId, handleCloseCanvasFloatingSession]);

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
      const isCanvasDisplayMode = agentSessionDisplayMode === 'canvas';

      if (matchesKeybinding(e, xtermKeybindings.newTab)) {
        e.preventDefault();
        handleNewSession();
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.closeTab)) {
        e.preventDefault();
        if (isCanvasDisplayMode) {
          if (canvasFocusedSessionId) {
            handleCloseSession(
              canvasFocusedSessionId,
              currentGroupIdBySessionId.get(canvasFocusedSessionId)
            );
          }
          return;
        }
        const activeGroup = groups.find((g) => g.id === activeGroupId);
        if (activeGroup?.activeSessionId) {
          handleCloseSession(activeGroup.activeSessionId, activeGroup.id);
        }
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.nextTab)) {
        e.preventDefault();
        if (isCanvasDisplayMode) {
          handleNextCanvasSession();
          return;
        }
        handleNextSession();
        return;
      }

      if (matchesKeybinding(e, xtermKeybindings.prevTab)) {
        e.preventDefault();
        if (isCanvasDisplayMode) {
          handlePrevCanvasSession();
          return;
        }
        handlePrevSession();
        return;
      }

      if (e.metaKey && e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (isCanvasDisplayMode) {
          const index = Number.parseInt(e.key, 10) - 1;
          const targetSession = currentWorktreeSessions[index];
          if (targetSession) {
            e.preventDefault();
            handleSelectSession(targetSession.id, currentGroupIdBySessionId.get(targetSession.id), {
              focusCanvasViewport: true,
            });
          }
          return;
        }
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
    agentSessionDisplayMode,
    canvasFocusedSessionId,
    currentGroupIdBySessionId,
    currentWorktreeSessions,
    xtermKeybindings,
    handleNewSession,
    handleCloseSession,
    handleNextCanvasSession,
    handlePrevCanvasSession,
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
  const mountedCurrentWorktreeSessionIds = useMemo(() => {
    const orderedIds = currentWorktreeSessions.map((session) => session.id);
    const seen = new Set(orderedIds);

    for (const sessionId of globalSessionIds) {
      if (!seen.has(sessionId)) {
        orderedIds.push(sessionId);
      }
    }

    return orderedIds;
  }, [currentWorktreeSessions, globalSessionIds]);
  const sessionById = useMemo(
    () => new Map(allSessions.map((session) => [session.id, session])),
    [allSessions]
  );
  const sessionPlacementById = useMemo(
    () => buildAgentSessionPlacementIndex(worktreeGroupStates),
    [worktreeGroupStates]
  );
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
  const handleToggleSessionSubagentInspector = useCallback((sessionId: string) => {
    setOpenSessionSubagentInspectorId((current) => (current === sessionId ? null : sessionId));
  }, []);
  const handleCloseSessionSubagentInspector = useCallback(() => {
    setOpenSessionSubagentInspectorId(null);
  }, []);
  const handleSelectSessionSubagentThread = useCallback((sessionId: string, threadId: string) => {
    setSelectedSubagentThreadIdBySessionId((current) => {
      if (current[sessionId] === threadId) {
        return current;
      }

      return {
        ...current,
        [sessionId]: threadId,
      };
    });
  }, []);

  if (!cwd) return null;

  // Check if current worktree has any groups (used for empty state detection)
  const hasAnyGroups = groups.length > 0;

  // Check if current worktree has no sessions (for empty state overlay)
  const showEmptyState = !hasAnyGroups && currentWorktreeSessions.length === 0;

  // Get current worktree's group positions for terminal placement
  const currentGroupPositions = resolveAgentGroupPositions(currentGroupState);
  const renderedSessionPanels = mountedCurrentWorktreeSessionIds.map((sessionId) => {
    const session = sessionById.get(sessionId);
    if (!session) return null;

    // Check if this session belongs to current repo
    const isCurrentRepo = matchesAgentSessionRepoPath(session, repoPath);

    const placement = sessionPlacementById.get(sessionId);

    // Determine if this session belongs to current worktree
    const isCurrentWorktree = isCurrentRepo && pathsEqual(session.cwd, cwd);

    // Calculate position - if no group info, use full width
    let left = 0;
    let width = 100;
    let isSessionVisible = true;
    let groupId: string | null = null;

    if (placement) {
      left = placement.left;
      width = placement.width;
      isSessionVisible = placement.isVisible;
      groupId = placement.groupId;
    }

    const isGroupActive = groupId === currentGroupState.activeGroupId;
    const isFocusedSession = session.id === canvasFocusedSessionId;
    const isTerminalActive = isCanvasDisplayMode
      ? isActive && isCurrentWorktree && isFocusedSession
      : isActive && isCurrentWorktree && isSessionVisible && isGroupActive;

    // Only show terminals from current repo + current worktree + active session
    const shouldShow =
      isCurrentRepo && isCurrentWorktree && (isCanvasDisplayMode || isSessionVisible);
    const canMerge = placement ? placement.groupIndex > 0 : false;
    const sessionAvailability = resolveAgentInputAvailability({
      backendSessionId: session.backendSessionId,
      runtimeState: session.recoveryState,
    });
    const canSendToSession = sessionAvailability === 'ready';
    const sessionSendLabel =
      sessionAvailability === 'awaiting-session'
        ? t('Awaiting Session')
        : sessionAvailability === 'reconnecting'
          ? t('Reconnecting')
          : sessionAvailability === 'disconnected'
            ? t('Disconnected')
            : t('Send');
    const sessionSendHint = resolveAgentInputUnavailableReason({
      agentCommand: session.agentCommand || 'claude',
      availability: sessionAvailability,
      isRemoteExecution: isRemoteVirtualPath(session.cwd),
      t,
    });
    const sender = enhancedInputSenderRef.current.get(sessionId);
    const tileAgentLabel = getAgentDisplayLabel(session.agentId, customAgents);
    const sessionWorktreeSubagents = liveSubagentsByWorktree.get(normalizePath(session.cwd)) ?? [];
    const matchedSessionSubagents = getMatchedSessionSubagents(
      session.agentId,
      session.agentCommand,
      session.sessionId,
      sessionWorktreeSubagents
    );
    const sessionScopedSubagents = sessionScopedSubagentsBySessionId[session.id] ?? [];
    const displayedSessionSubagents =
      inspectorSubagentsBySessionId[session.id] ??
      (sessionScopedSubagents.length > 0 ? sessionScopedSubagents : matchedSessionSubagents);
    const sessionSubagentViewState = sessionSubagentViewStateBySessionId[session.id];
    const isSessionSubagentInspectorOpen = openSessionSubagentInspectorId === session.id;
    const isCanvasFloatingSession = isCanvasDisplayMode && session.id === canvasFloatingSessionId;
    const sessionContentHost = ensureCanvasSessionContentHost(sessionId);
    const canvasTileColumnSpan =
      canvasTileColumnSpanBySessionId.get(sessionId) ??
      AGENT_CANVAS_GRID_COLUMN_UNITS / Math.max(canvasColumnCount, 1);
    const canRenderCanvasFloatingSessionInPortal =
      sessionContentHost !== null && isCanvasFloatingSession && canvasFloatingFrame !== null;
    const shouldDimCanvasTile =
      isCanvasDisplayMode && canvasFloatingSessionId !== null && !isCanvasFloatingSession;
    const renderSessionHeaderSummary = () => (
      <div className="flex min-w-0 items-center gap-2">
        <span className="control-chip shrink-0 max-w-[45%] gap-1.5 truncate">
          {renderAgentLabelIcon(session.agentId)}
          <span className="truncate">{tileAgentLabel}</span>
        </span>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {session.name}
        </div>
      </div>
    );
    const renderSessionSubagentTrigger = (className: string) => (
      <SessionSubagentTriggerButton
        count={displayedSessionSubagents.length}
        isActive={isSessionSubagentInspectorOpen}
        className={className}
        title={t('View session subagents')}
        ariaLabel={t('View session subagents')}
        onClick={() => handleToggleSessionSubagentInspector(session.id)}
      />
    );
    const sessionPanelContent = (
      <div
        key={`${sessionId}-content`}
        data-agent-canvas-floating={isCanvasFloatingSession ? 'true' : undefined}
        className={cn(isCanvasDisplayMode ? 'flex h-full min-h-0 flex-1 flex-col gap-2' : 'h-full')}
      >
        <div
          className={cn(
            isCanvasDisplayMode
              ? cn(
                  'flex min-h-0 shrink-0 items-start justify-between gap-2 px-1 pt-1',
                  canRenderCanvasFloatingSessionInPortal && 'hidden'
                )
              : 'hidden'
          )}
        >
          <button
            type="button"
            data-agent-canvas-header={isCanvasDisplayMode ? 'true' : undefined}
            className={cn(
              'min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition-colors',
              isCanvasDisplayMode ? 'hover:bg-accent/20' : 'pointer-events-none'
            )}
            onClick={(event) => {
              event.stopPropagation();
              handleOpenCanvasFloatingSession(sessionId, groupId ?? undefined);
            }}
          >
            {renderSessionHeaderSummary()}
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {isCanvasDisplayMode
              ? renderSessionSubagentTrigger(
                  'control-panel flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent/30'
                )
              : null}
            {isCanvasDisplayMode && !isCanvasFloatingSession ? (
              <button
                type="button"
                className="control-panel flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent/30"
                aria-label={t('Bring to Front')}
                title={t('Bring to Front')}
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenCanvasFloatingSession(sessionId, groupId ?? undefined);
                }}
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            ) : null}
            {isCanvasFloatingSession && !canRenderCanvasFloatingSessionInPortal ? (
              <button
                type="button"
                className="control-panel flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent/30"
                aria-label={t('Back to Canvas')}
                title={t('Back to Canvas')}
                onClick={(event) => {
                  event.stopPropagation();
                  handleCloseCanvasFloatingSession();
                }}
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            ) : null}
            {!canRenderCanvasFloatingSessionInPortal ? (
              <button
                type="button"
                className="control-panel flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent/30"
                aria-label={t('Close')}
                title={t('Close')}
                onClick={(event) => {
                  event.stopPropagation();
                  handleCloseSession(session.id, groupId ?? undefined);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            'relative min-h-0',
            isCanvasDisplayMode
              ? 'flex-1 overflow-hidden rounded-xl border border-border/60 bg-background/20'
              : 'h-full'
          )}
        >
          {/* Inactive overlay - like TerminalGroup */}
          {!isCanvasDisplayMode && shouldShow && !isGroupActive ? (
            <div className="absolute inset-0 z-10 bg-background/10 pointer-events-none" />
          ) : null}
          <AgentTerminal
            id={session.id}
            createdAt={session.createdAt}
            repoPath={repoPath}
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
            hostSessionKey={session.hostSessionKey}
            recovered={session.recovered}
            isActive={isTerminalActive}
            terminalFontScale={
              isCanvasFloatingSession
                ? canvasFloatingTerminalFontScale
                : isCanvasDisplayMode
                  ? canvasZoomTerminalFontScale
                  : undefined
            }
            hasPendingCommand={!!session.pendingCommand}
            initialPrompt={session.pendingCommand}
            sessionPolicy={session.claudeSessionPolicy}
            materializationMode={session.claudePolicyMaterializationMode}
            onInitialized={() => handleInitialized(sessionId)}
            onActivated={() => handleActivated(sessionId)}
            onActivatedWithFirstLine={(line) => handleActivatedWithFirstLine(sessionId, line)}
            onExit={() => handleSessionExit(sessionId, groupId || undefined)}
            onTerminalTitleChange={(title) => {
              if (session.userRenamed) return;
              const nextTerminalTitle = getMeaningfulTerminalTitle(title);
              const defaultName = getDefaultSessionName(session.agentId);
              const currentName = normalizeSessionTitleText(session.name);
              const syncName =
                nextTerminalTitle &&
                isCursorAgent(session.agentId) &&
                (!currentName || currentName === normalizeSessionTitleText(defaultName));
              updateSession(sessionId, {
                terminalTitle: nextTerminalTitle,
                ...(syncName ? { name: nextTerminalTitle } : {}),
              });
            }}
            onBackendSessionIdChange={(backendSessionId) => {
              if (session.backendSessionId === backendSessionId) return;
              updateSession(sessionId, { backendSessionId });
            }}
            onProviderSessionIdChange={(providerSessionId) => {
              if (session.sessionId === providerSessionId) return;
              updateSession(sessionId, { sessionId: providerSessionId });
            }}
            onRuntimeStateChange={(runtimeState) => {
              if (session.recoveryState === runtimeState) return;
              updateSession(sessionId, { recoveryState: runtimeState });
            }}
            onClaudePolicyStateChange={(policyState) => {
              if (
                session.claudePolicyHash === policyState.hash &&
                session.claudePolicyStale === false &&
                JSON.stringify(session.claudePolicyWarnings ?? []) ===
                  JSON.stringify(policyState.warnings)
              ) {
                return;
              }
              updateSession(sessionId, {
                claudePolicyHash: policyState.hash,
                claudePolicyWarnings: policyState.warnings,
                claudePolicyStale: false,
              });
            }}
            onSplit={() => groupId && handleSplit(groupId)}
            canMerge={canMerge}
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

        <div className={cn(isCanvasDisplayMode ? 'pointer-events-auto' : 'hidden')}>
          {isCanvasDisplayMode ? (
            <>
              {shouldRenderEnhancedInput(session.id) ? (
                <EnhancedInputContainer
                  sessionId={session.id}
                  canSend={canSendToSession}
                  sendLabel={sessionSendLabel}
                  sendHint={sessionSendHint}
                  onSend={(content, attachments) => sender?.(content, attachments) ?? false}
                  isActive={isActive && isFocusedSession}
                />
              ) : null}
              {statusLineEnabled ? (
                <StatusLine
                  sessionId={session.id}
                  onRequestFreshSession={
                    groupId ? () => handleStartFreshSession(session, groupId) : undefined
                  }
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    );
    const sessionSubagentInspector = isSessionSubagentInspectorOpen ? (
      <SessionSubagentInspector
        key={`${session.id}-subagent-inspector`}
        sessionName={session.name}
        agentLabel={tileAgentLabel}
        sessionCwd={session.cwd}
        providerSessionId={session.sessionId}
        viewState={sessionSubagentViewState}
        subagents={displayedSessionSubagents}
        surfaceColor={terminalBgColor}
        selectedThreadId={selectedSubagentThreadIdBySessionId[session.id] ?? null}
        onSubagentsChange={(subagents) =>
          handleSessionInspectorSubagentsChange(session.id, subagents)
        }
        onSelectThread={(threadId) => handleSelectSessionSubagentThread(session.id, threadId)}
        onClose={handleCloseSessionSubagentInspector}
      />
    ) : null;
    // Render the inspector above the canvas transform so it does not scale or pan with tiles.
    const sessionSubagentInspectorPortal =
      sessionSubagentInspector === null
        ? null
        : typeof document !== 'undefined' && document.body
          ? createPortal(sessionSubagentInspector, document.body)
          : sessionSubagentInspector;
    const sessionPanelContentPortal =
      sessionContentHost !== null ? createPortal(sessionPanelContent, sessionContentHost) : null;

    const sessionPanelShell = (
      <div
        key={sessionId}
        id={buildSessionPanelDomId(sessionId)}
        {...(isCanvasDisplayMode ? { [AGENT_CANVAS_SESSION_PANEL_ATTRIBUTE]: 'true' } : undefined)}
        className={cn(
          isCanvasDisplayMode
            ? 'control-panel-muted flex h-full min-h-0 overflow-hidden rounded-2xl border p-2 shadow-sm transition-colors'
            : shouldShow
              ? 'absolute top-0 h-full'
              : 'absolute top-0 h-full opacity-0 pointer-events-none',
          shouldDimCanvasTile && 'opacity-35',
          canRenderCanvasFloatingSessionInPortal && 'opacity-0 pointer-events-none',
          isCanvasDisplayMode &&
            (isFocusedSession ? 'border-primary/60 ring-1 ring-primary/40' : 'border-border/70')
        )}
        style={
          isCanvasDisplayMode
            ? {
                gridColumn: `span ${canvasTileColumnSpan} / span ${canvasTileColumnSpan}`,
              }
            : {
                left: `${left}%`,
                width: `${width}%`,
              }
        }
        onMouseDownCapture={
          isCanvasDisplayMode
            ? () => handleSelectSession(sessionId, groupId ?? undefined)
            : undefined
        }
      >
        {canRenderCanvasFloatingSessionInPortal ? (
          <div className="h-full w-full rounded-[inherit] border border-transparent" />
        ) : sessionContentHost ? (
          <CanvasSessionContentOutlet
            className="h-full w-full rounded-[inherit]"
            hostElement={sessionContentHost}
          />
        ) : (
          sessionPanelContent
        )}
      </div>
    );

    return canRenderCanvasFloatingSessionInPortal ? (
      <Fragment key={sessionId}>
        {sessionPanelContentPortal}
        {sessionPanelShell}
        {sessionSubagentInspectorPortal}
        {createPortal(
          <div
            {...{ [AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE]: 'true' }}
            className="fixed z-30 flex flex-col overflow-hidden rounded-[20px] border border-primary/50 bg-background shadow-2xl pointer-events-auto no-drag"
            style={
              canvasFloatingFrame
                ? {
                    height: `${canvasFloatingFrame.height}px`,
                    left: `${canvasFloatingFrame.left}px`,
                    top: `${canvasFloatingFrame.top}px`,
                    width: `${canvasFloatingFrame.width}px`,
                  }
                : undefined
            }
          >
            <div className="control-panel-muted pointer-events-auto relative z-20 flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-3 py-2 no-drag">
              <div className="min-w-0">{renderSessionHeaderSummary()}</div>
              <div className="flex shrink-0 items-center gap-2">
                {renderSessionSubagentTrigger(
                  'control-panel pointer-events-auto relative z-20 flex h-10 w-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent/30 no-drag'
                )}
                <button
                  type="button"
                  className="control-panel pointer-events-auto relative z-20 flex h-10 w-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent/30 no-drag"
                  aria-label={t('Back to Canvas')}
                  title={t('Back to Canvas')}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseCanvasFloatingSession();
                  }}
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="control-panel pointer-events-auto relative z-20 flex h-10 w-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent/30 no-drag"
                  aria-label={t('Close')}
                  title={t('Close')}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseSession(session.id, groupId ?? undefined);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <CanvasSessionContentOutlet
              className="min-h-0 flex-1"
              hostElement={sessionContentHost}
            />
          </div>,
          document.body
        )}
      </Fragment>
    ) : (
      <Fragment key={sessionId}>
        {sessionPanelContentPortal}
        {sessionPanelShell}
        {sessionSubagentInspectorPortal}
      </Fragment>
    );
  });

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
          bgImageEnabled={backgroundImageEnabled}
          buttonStyle={emptyStateButtonStyle}
          cwd={cwd}
          defaultAgentLabel={defaultAgentLabel}
          emptyStateModel={emptyStateModel}
          enabledAgentCount={enabledAgents.length}
          onOpenAgentSettings={handleOpenAgentSettings}
          onOpenLaunchOptions={(agentId, agentCommand) =>
            handleOpenSessionLaunchOptions(agentId, agentCommand)
          }
          onStartDefaultSession={handleNewSession}
          onStartSessionWithAgent={handleNewSessionWithAgent}
          profiles={emptyStateProfiles}
        />
      ) : null}
      {isCanvasDisplayMode && currentWorktreeSessions.length > 0 ? (
        <div className="absolute inset-x-2 top-2 z-10 flex items-center justify-end gap-2">
          <div className="flex items-center justify-end gap-2">
            <div className="control-panel-muted pointer-events-auto flex items-center gap-1 rounded-xl p-1">
              <button
                type="button"
                className={cn(
                  'control-panel flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent/30',
                  isCanvasLocked && 'bg-accent/30 text-primary'
                )}
                aria-label={isCanvasLocked ? t('Unlock Canvas') : t('Lock Canvas')}
                title={isCanvasLocked ? t('Unlock Canvas') : t('Lock Canvas')}
                onClick={handleToggleCanvasLock}
              >
                {isCanvasLocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </button>
              <button
                type="button"
                className="control-panel flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent/30 disabled:opacity-50"
                aria-label={t('Center')}
                title={t('Center')}
                onClick={handleCenterCanvasViewport}
                disabled={isCanvasLocked}
              >
                <Crosshair className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="control-panel flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent/30 disabled:opacity-50"
                aria-label={t('Zoom Out')}
                title={t('Zoom Out')}
                onClick={handleCanvasZoomOut}
                disabled={isCanvasLocked || canvasZoom <= AGENT_CANVAS_ZOOM_MIN}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="control-panel rounded-lg px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent/30"
                aria-label={t('Reset Zoom')}
                title={t('Reset Zoom')}
                onClick={handleCanvasZoomReset}
                disabled={isCanvasLocked}
              >
                {canvasZoomLabel}
              </button>
              <button
                type="button"
                className="control-panel flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent/30 disabled:opacity-50"
                aria-label={t('Zoom In')}
                title={t('Zoom In')}
                onClick={handleCanvasZoomIn}
                disabled={isCanvasLocked || canvasZoom >= AGENT_CANVAS_ZOOM_MAX}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              {quickTerminalEnabled ? (
                <button
                  type="button"
                  className={cn(
                    'control-panel-muted pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent/30',
                    quickTerminalOpen
                      ? 'control-icon-button-active'
                      : hasRunningProcess
                        ? 'control-icon-button-live'
                        : undefined
                  )}
                  aria-label={t('Quick Terminal')}
                  title={t('Quick Terminal (Ctrl+`)')}
                  onClick={handleToggleQuickTerminal}
                >
                  <Terminal className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                className="control-panel-muted pointer-events-auto inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/30"
                onClick={() => handleNewSession()}
              >
                <Plus className="h-4 w-4" />
                {t('New Session')}
              </button>
              <Menu>
                <MenuTrigger
                  render={
                    <button
                      type="button"
                      className="control-panel-muted pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent/30"
                      aria-label={t('Choose session agent')}
                      title={t('Choose session agent')}
                      disabled={emptyStateProfiles.length === 0}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  }
                />
                <MenuPopup align="end" sideOffset={8} className="min-w-48 rounded-2xl p-2">
                  <div className="mb-1 flex items-center justify-between px-1 py-1">
                    <span className="control-menu-label text-muted-foreground">
                      {t('Select Agent')}
                    </span>
                    <button
                      type="button"
                      aria-label={t('Agent profiles')}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenAgentSettings();
                      }}
                      className="control-icon-button flex h-7 w-7 items-center justify-center"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {emptyStateProfiles.map((profile) => (
                    <div key={profile.agentId} className="mt-1 flex items-center gap-1">
                      <MenuItem
                        onClick={() => handleNewSessionWithAgent(profile.agentId, profile.command)}
                        className="control-menu-item flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-foreground"
                      >
                        <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                        {profile.isDefault ? (
                          <span className="control-chip control-chip-strong shrink-0">
                            {t('Default')}
                          </span>
                        ) : null}
                      </MenuItem>
                      {supportsAgentCapabilityPolicyLaunch(profile.agentId, profile.command) ? (
                        <button
                          type="button"
                          aria-label={t('Skill & MCP')}
                          title={t('Skill & MCP')}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenSessionLaunchOptions(profile.agentId, profile.command);
                          }}
                          className="control-icon-button flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </MenuPopup>
              </Menu>
            </div>
          </div>
        </div>
      ) : null}
      {/* Resize handles - only for current worktree */}
      {!isCanvasDisplayMode &&
        currentGroupState.groups.length > 1 &&
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
        ref={canvasViewportRef}
        className={cn(
          'absolute left-2 right-2 z-0',
          isCanvasDisplayMode
            ? 'top-14 bottom-2 overflow-auto overscroll-contain touch-none'
            : 'top-2',
          isCanvasDisplayMode &&
            (isCanvasLocked
              ? 'cursor-default'
              : isCanvasPanning
                ? 'cursor-grabbing select-none'
                : 'cursor-grab')
        )}
        style={isCanvasDisplayMode ? undefined : { bottom: maxStatusLineHeight + 8 }}
        onPointerDownCapture={isCanvasDisplayMode ? handleCanvasViewportPointerDown : undefined}
        onPointerMove={isCanvasDisplayMode ? handleCanvasViewportPointerMove : undefined}
        onPointerUp={isCanvasDisplayMode ? handleCanvasViewportPointerUp : undefined}
        onPointerCancel={isCanvasDisplayMode ? handleCanvasViewportPointerCancel : undefined}
        onScroll={isCanvasDisplayMode ? handleCanvasViewportScroll : undefined}
        onWheelCapture={isCanvasDisplayMode ? handleCanvasViewportWheel : undefined}
      >
        {isCanvasDisplayMode && canvasFloatingSessionId ? (
          <button
            type="button"
            {...{ [AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE]: 'true' }}
            className="absolute inset-0 z-20 bg-background/58 backdrop-blur-[1px] no-drag"
            aria-label={t('Dismiss Floating Session')}
            onClick={handleCloseCanvasFloatingSession}
          />
        ) : null}
        {isCanvasDisplayMode ? (
          <div
            className="relative min-h-full min-w-full"
            style={{
              width: `${canvasViewportMetrics.planePercent}%`,
              height: `${canvasViewportMetrics.planePercent}%`,
            }}
          >
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: `${canvasViewportMetrics.framePercent}%`,
                height: `${canvasViewportMetrics.framePercent}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                className="grid h-full w-full gap-3 transition-transform duration-150 ease-out motion-reduce:transition-none"
                style={{
                  transform: `scale(${canvasViewportMetrics.zoom})`,
                  transformOrigin: 'center center',
                  gridTemplateColumns: `repeat(${AGENT_CANVAS_GRID_COLUMN_UNITS}, minmax(0, 1fr))`,
                  gridAutoRows: 'minmax(0, 1fr)',
                }}
              >
                {renderedSessionPanels}
              </div>
            </div>
          </div>
        ) : (
          <div className="relative h-full min-h-0">{renderedSessionPanels}</div>
        )}
      </div>

      {/* Session bars (floating) - rendered for each group in current worktree */}
      {/* pointer-events-none on container, AgentGroup handles its own pointer-events */}
      {!isCanvasDisplayMode &&
        currentGroupState.groups.map((group, index) => {
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
          const activeSessionSubagents =
            activeSession == null
              ? []
              : (inspectorSubagentsBySessionId[activeSession.id] ??
                (() => {
                  const sessionScopedSubagents =
                    sessionScopedSubagentsBySessionId[activeSession.id] ?? [];
                  if (sessionScopedSubagents.length > 0) {
                    return sessionScopedSubagents;
                  }

                  return getMatchedSessionSubagents(
                    activeSession.agentId,
                    activeSession.agentCommand,
                    activeSession.sessionId,
                    liveSubagentsByWorktree.get(normalizePath(activeSession.cwd)) ?? []
                  );
                })());
          const activeSessionSubagentViewState =
            activeSession == null ? null : sessionSubagentViewStateBySessionId[activeSession.id];
          const activeSessionToolbarAccessory =
            activeSession != null && activeSessionSubagentViewState != null ? (
              <SessionSubagentTriggerButton
                count={activeSessionSubagents.length}
                isActive={openSessionSubagentInspectorId === activeSession.id}
                className="control-icon-button flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                title={t('View session subagents')}
                ariaLabel={t('View session subagents')}
                onClick={() => handleToggleSessionSubagentInspector(activeSession.id)}
              />
            ) : null;
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
                activityStateBySessionId={sessionActivityStateById}
                enabledAgents={enabledAgents}
                customAgents={customAgents}
                agentSettings={agentSettings}
                agentInfo={AGENT_INFO}
                toolbarAccessory={activeSessionToolbarAccessory}
                onSessionSelect={(id) => handleSelectSession(id, group.id)}
                onSessionClose={(id) => handleCloseSession(id, group.id)}
                onSessionNew={() => handleNewSession(group.id)}
                onSessionNewWithAgent={(agentId, cmd) =>
                  handleNewSessionWithAgent(agentId, cmd, group.id)
                }
                onOpenLaunchOptions={(agentId, agentCommand) =>
                  handleOpenSessionLaunchOptions(agentId, agentCommand, group.id)
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
                  activeSession != null &&
                  shouldRenderEnhancedInput(activeSession.id) && (
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
      {sessionLaunchPolicyDialog ? (
        <ClaudeSessionLaunchDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setSessionLaunchPolicyDialog(null);
            }
          }}
          repoPath={repoPath}
          worktreePath={cwd}
          agentLabel={sessionLaunchPolicyDialog.agentLabel}
          initialPolicy={sessionLaunchPolicyDialog.initialPolicy}
          onLaunch={handleLaunchSessionWithOptions}
        />
      ) : null}
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
