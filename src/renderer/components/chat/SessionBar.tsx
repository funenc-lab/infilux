import type {
  ClaudePolicyConfig,
  ClaudePolicyMaterializationMode,
  ClaudeProvider,
  PersistentAgentRuntimeState,
} from '@shared/types';
import { supportsAgentCapabilityPolicyLaunch } from '@shared/utils/agentCapabilityPolicy';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle,
  ChevronDown,
  Circle,
  GripVertical,
  Plus,
  RectangleEllipsis,
  Settings,
  Settings2,
  Terminal,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { getActivityStateMeta } from '@/components/ui/activityStatus';
import { GlowCard } from '@/components/ui/glow-card';
import { toastManager } from '@/components/ui/toast';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useSessionOutputState, useSessionTaskCompletionNotice } from '@/hooks/useOutputState';
import { useI18n } from '@/i18n';
import {
  clearClaudeProviderSwitch,
  isClaudeProviderMatch,
  markClaudeProviderSwitch,
} from '@/lib/claudeProvider';
import { buildSettingsWorkflowToastCopy } from '@/lib/feedbackCopy';
import { cn } from '@/lib/utils';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { resolvePersistedInstalledAgents, resolveRemoteInstalledAgents } from './agentAvailability';
import {
  CHAT_MENU_ICON_BUTTON_CLASS_NAME,
  CHAT_MENU_ITEM_BASE_CLASS_NAME,
  CHAT_MENU_UTILITY_ICON_BUTTON_CLASS_NAME,
  CHAT_PRIMARY_ICON_BUTTON_CLASS_NAME,
  CHAT_TOOLBAR_ICON_BUTTON_CLASS_NAME,
} from './controlButtonStyles';
import type { SessionActivityState } from './sessionActivityState';
import { getSessionDisplayName, getSessionHoverTitle } from './sessionBarLabels';
import { supportsClaudeProviderSwitcher } from './sessionBarProviderPolicy';

const STORAGE_KEY = 'enso-session-bar';
const EDGE_THRESHOLD = 20; // pixels from edge
const FLOATING_BAR_MARGIN_PX = 8;

export interface Session {
  id: string; // Session's own unique ID
  sessionId?: string; // Optional provider session ID for agent-level resume flows (defaults to id if not set)
  backendSessionId?: string; // Backend session host ID used by the unified session API
  createdAt?: number; // Stable session creation time used for persistence metadata
  name: string;
  agentId: string; // which agent CLI to use (e.g., 'claude', 'codex', 'gemini', 'claude-hapi', 'claude-happy')
  agentCommand: string; // the CLI command to run (e.g., 'claude', 'codex')
  customPath?: string; // custom absolute path to the agent CLI (overrides agentCommand lookup)
  customArgs?: string; // additional arguments to pass to the agent
  initialized: boolean; // true after the first interactive run, enabling provider resume when supported
  activated?: boolean; // true after user presses Enter, only activated sessions are persisted
  repoPath: string; // repository path this session belongs to
  cwd: string; // worktree path this session belongs to
  environment?: 'native' | 'hapi' | 'happy'; // execution environment (default: native)
  displayOrder?: number; // order in SessionBar (lower = first), used for drag reorder
  terminalTitle?: string; // current terminal title from OSC escape sequence
  userRenamed?: boolean; // true when user has manually renamed this session
  pendingCommand?: string; // command to send after agent is ready (e.g., from todo task)
  persistenceEnabled?: boolean; // whether this session should be restored across app restarts
  hostSessionKey?: string; // persisted tmux host session key used for unix session recovery
  recovered?: boolean;
  recoveryState?: PersistentAgentRuntimeState;
  claudePolicyHash?: string;
  claudePolicyWarnings?: string[];
  claudePolicyStale?: boolean;
  claudeSessionPolicy?: ClaudePolicyConfig | null;
  claudePolicyMaterializationMode?: ClaudePolicyMaterializationMode;
}

interface SessionBarProps {
  sessions: Session[];
  activeSessionId: string | null;
  activityStateBySessionId?: Record<string, SessionActivityState>;
  repoPath?: string;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNewSession: () => void;
  onNewSessionWithAgent?: (agentId: string, agentCommand: string) => void;
  onOpenLaunchOptions?: (agentId: string, agentCommand: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onReorderSessions?: (fromIndex: number, toIndex: number) => void;
  // Quick Terminal props
  quickTerminalOpen?: boolean;
  quickTerminalHasProcess?: boolean;
  onToggleQuickTerminal?: () => void;
}

interface BarState {
  x: number;
  y: number;
  collapsed: boolean;
  edge: 'left' | 'right' | null;
}

function loadState(): BarState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { x: 50, y: 16, collapsed: false, edge: null };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampFloatingBarState(
  state: BarState,
  dimensions: {
    containerWidth: number;
    containerHeight: number;
    barWidth: number;
    barHeight: number;
  }
): BarState {
  const { containerWidth, containerHeight, barWidth, barHeight } = dimensions;
  if (containerWidth <= 0 || containerHeight <= 0) return state;

  const maxTop = Math.max(
    FLOATING_BAR_MARGIN_PX,
    containerHeight - barHeight - FLOATING_BAR_MARGIN_PX
  );
  const nextY = clampNumber(state.y, FLOATING_BAR_MARGIN_PX, maxTop);

  if (state.collapsed) {
    if (nextY === state.y) return state;
    return { ...state, y: nextY };
  }

  const minCenterPx = Math.min(barWidth / 2 + FLOATING_BAR_MARGIN_PX, containerWidth / 2);
  const maxCenterPx = Math.max(
    containerWidth - barWidth / 2 - FLOATING_BAR_MARGIN_PX,
    containerWidth / 2
  );
  const nextX = clampNumber(
    state.x,
    (minCenterPx / containerWidth) * 100,
    (maxCenterPx / containerWidth) * 100
  );

  if (nextX === state.x && nextY === state.y) {
    return state;
  }

  return {
    ...state,
    x: nextX,
    y: nextY,
  };
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
const SESSION_BAR_PROVIDER_MENU_ITEM_CLASS_NAME = `${CHAT_MENU_ITEM_BASE_CLASS_NAME} mt-1 rounded-xl px-3 py-2 text-sm text-foreground`;
const SESSION_BAR_MENU_UTILITY_BUTTON_CLASS_NAME = `${CHAT_MENU_UTILITY_ICON_BUTTON_CLASS_NAME} rounded-md`;

// Session tab with glow effect
interface SessionTabProps {
  session: Session;
  activityState?: SessionActivityState;
  index: number;
  tabId: string;
  panelId: string;
  isActive: boolean;
  isEditing: boolean;
  editingName: string;
  isDragging: boolean;
  dropTargetIndex: number | null;
  draggedTabIndex: number | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: () => void;
  onClose: () => void;
  onStartEdit: () => void;
  onEditingNameChange: (name: string) => void;
  onFinishEdit: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onTabKeyDown: (e: React.KeyboardEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

interface ProviderMenuItemProps {
  provider: ClaudeProvider;
  isActive: boolean;
  isDisabled: boolean;
  isPending: boolean;
  activeProviderId: string | undefined;
  providers: ClaudeProvider[];
  onApplyProvider: (provider: ClaudeProvider) => void;
  onCloseMenu: () => void;
  setClaudeProviderEnabled: (id: string, enabled: boolean) => void;
  enableProviderDisableFeature: boolean;
  t: (key: string) => string;
}

const ProviderMenuItem = React.memo(function ProviderMenuItem({
  provider,
  isActive,
  isDisabled,
  isPending,
  activeProviderId,
  providers,
  onApplyProvider,
  onCloseMenu,
  setClaudeProviderEnabled,
  enableProviderDisableFeature,
  t,
}: ProviderMenuItemProps) {
  const effectiveIsDisabled = enableProviderDisableFeature ? isDisabled : false;

  const handleSwitch = useCallback(() => {
    if (!isActive && !effectiveIsDisabled) {
      onApplyProvider(provider);
      onCloseMenu();
    }
  }, [isActive, effectiveIsDisabled, provider, onApplyProvider, onCloseMenu]);

  const handleToggleEnabled = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const isCurrentlyEnabled = provider.enabled !== false;
      setClaudeProviderEnabled(provider.id, !isCurrentlyEnabled);

      // Automatically switch away from the active provider when it becomes disabled.
      if (isCurrentlyEnabled && activeProviderId === provider.id) {
        const nextEnabledProvider = providers.find(
          (p) => p.id !== provider.id && p.enabled !== false
        );
        if (nextEnabledProvider) {
          onApplyProvider(nextEnabledProvider);
        }
      }
    },
    [provider, activeProviderId, providers, setClaudeProviderEnabled, onApplyProvider]
  );

  return (
    <div
      className={cn(SESSION_BAR_PROVIDER_MENU_ITEM_CLASS_NAME, effectiveIsDisabled && 'opacity-50')}
    >
      <button
        type="button"
        onClick={handleSwitch}
        disabled={isPending || effectiveIsDisabled}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 text-left',
          isPending && 'cursor-not-allowed'
        )}
      >
        {isActive ? (
          <CheckCircle className="h-4 w-4 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 shrink-0" />
        )}
        <span className={cn('min-w-0 truncate', effectiveIsDisabled && 'line-through')}>
          {provider.name}
        </span>
      </button>

      {enableProviderDisableFeature && (
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <button
              type="button"
              onClick={handleToggleEnabled}
              className={cn(SESSION_BAR_MENU_UTILITY_BUTTON_CLASS_NAME, 'opacity-80')}
            >
              {isDisabled ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipPopup side="right">
            {isDisabled ? t('Click to enable this Provider') : t('Click to disable this Provider')}
          </TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
});

function buildSessionTabId(sessionId: string): string {
  return `agent-session-tab-${sessionId}`;
}

function buildSessionPanelId(sessionId: string): string {
  return `agent-session-panel-${sessionId}`;
}

const MAX_TAB_TEXT_WIDTH = 120;
const SESSION_BAR_TAB_CLASS_NAME =
  'control-session-tab group flex h-8 items-center gap-2 rounded-xl px-2.5 text-sm transition-all cursor-pointer';
const SESSION_TAB_STATUS_INDICATOR_CLASS_NAME = 'relative z-10 rounded-[0.25rem]';
const SESSION_BAR_TOOLBAR_BUTTON_CLASS_NAME = `${CHAT_TOOLBAR_ICON_BUTTON_CLASS_NAME} h-8 w-8 rounded-lg`;
const SESSION_BAR_MENU_BUTTON_CLASS_NAME = `${CHAT_MENU_ICON_BUTTON_CLASS_NAME} rounded-lg`;
const SESSION_BAR_COLLAPSED_BUTTON_CLASS_NAME = `${CHAT_TOOLBAR_ICON_BUTTON_CLASS_NAME} h-10 w-10 rounded-xl text-muted-foreground`;
const SESSION_BAR_SPLIT_ACTION_GROUP_CLASS_NAME = 'flex items-center overflow-hidden rounded-lg';
const SESSION_BAR_SPLIT_ACTION_BUTTON_CLASS_NAME = CHAT_PRIMARY_ICON_BUTTON_CLASS_NAME;
const SESSION_BAR_SPLIT_PRIMARY_ACTION_BUTTON_CLASS_NAME = `${SESSION_BAR_SPLIT_ACTION_BUTTON_CLASS_NAME} h-8 w-8 rounded-l-lg rounded-r-none border-r-0`;
const SESSION_BAR_SPLIT_TOGGLE_ACTION_BUTTON_CLASS_NAME = `${SESSION_BAR_SPLIT_ACTION_BUTTON_CLASS_NAME} -ml-px h-8 w-7 rounded-l-none rounded-r-lg border-l border-foreground/12`;

/** Text that scrolls horizontally when overflowing */
function MarqueeText({ children, className }: { children: string; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);

  const innerRefCb = useCallback((node: HTMLSpanElement | null) => {
    if (!node || !outerRef.current) return;
    setOverflow(Math.max(0, node.scrollWidth - outerRef.current.clientWidth));
  }, []);

  return (
    <div
      ref={outerRef}
      className={cn('overflow-hidden whitespace-nowrap', className)}
      style={{ maxWidth: `clamp(72px, 18vw, ${MAX_TAB_TEXT_WIDTH}px)` }}
    >
      <span
        ref={innerRefCb}
        className={cn('inline-block', overflow > 0 && 'group-hover:animate-marquee')}
        style={
          overflow > 0
            ? ({ '--marquee-offset': `-${overflow + 8}px` } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </span>
    </div>
  );
}

function SessionTab({
  session,
  activityState,
  index,
  tabId,
  panelId,
  isActive,
  isEditing,
  editingName,
  isDragging,
  dropTargetIndex,
  draggedTabIndex,
  inputRef,
  onSelect,
  onClose,
  onStartEdit,
  onEditingNameChange,
  onFinishEdit,
  onEditKeyDown,
  onTabKeyDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: SessionTabProps) {
  const fallbackActivityState = useSessionOutputState(session.id);
  const outputState = activityState ?? fallbackActivityState;
  const hasCompletedTaskNotice = useSessionTaskCompletionNotice(session.id);
  const clearTaskCompletedUnread = useAgentSessionsStore((s) => s.clearTaskCompletedUnread);
  const stateMeta = getActivityStateMeta(outputState);
  const sessionLabel = getSessionDisplayName(session);
  const sessionHoverTitle = getSessionHoverTitle(session);
  const closeLabel = `Close ${sessionLabel}`;
  const handleSelect = useCallback(() => {
    clearTaskCompletedUnread(session.id);
    onSelect();
  }, [clearTaskCompletedUnread, onSelect, session.id]);
  const tabProps = {
    id: tabId,
    role: 'tab' as const,
    tabIndex: isActive ? 0 : -1,
    'aria-selected': isActive,
    'aria-controls': panelId,
    'aria-label': sessionLabel,
    'data-active': isActive ? 'true' : 'false',
    className: cn(
      SESSION_BAR_TAB_CLASS_NAME,
      isActive ? 'text-foreground' : 'text-foreground/80 hover:text-foreground',
      isDragging && 'opacity-50'
    ),
    draggable: true,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onClick: handleSelect,
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onStartEdit();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      onTabKeyDown(e);
      if (e.defaultPrevented) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onStartEdit();
    },
  };
  const foregroundClassName = 'relative z-10';
  const tabContent = (
    <>
      {outputState === 'idle' ? (
        <span
          className={cn(
            SESSION_TAB_STATUS_INDICATOR_CLASS_NAME,
            'h-1.5 w-1.5 shrink-0',
            stateMeta.dotClassName
          )}
        />
      ) : (
        <ActivityIndicator
          state={outputState}
          size="sm"
          className={SESSION_TAB_STATUS_INDICATOR_CLASS_NAME}
        />
      )}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editingName}
          onChange={(e) => onEditingNameChange(e.target.value)}
          onBlur={onFinishEdit}
          onKeyDown={onEditKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            foregroundClassName,
            'control-input h-6 w-24 rounded-md border-0 px-2 text-sm text-foreground outline-none'
          )}
        />
      ) : (
        <MarqueeText className={foregroundClassName}>{sessionLabel}</MarqueeText>
      )}
      {hasCompletedTaskNotice ? (
        <span className={cn(foregroundClassName, 'control-session-completion-dot')} />
      ) : null}
      <button
        type="button"
        aria-label={closeLabel}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          foregroundClassName,
          'flex h-5 w-5 items-center justify-center rounded-lg transition-colors',
          'hover:bg-destructive/12 hover:text-destructive',
          !isActive && 'opacity-45 group-hover:opacity-100 group-focus-within:opacity-100'
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </>
  );
  const tabElement = (
    <GlowCard state={outputState} as="div" {...tabProps}>
      {tabContent}
    </GlowCard>
  );

  return (
    <div className="relative flex items-center">
      {/* Drop indicator - left side */}
      {dropTargetIndex === index && draggedTabIndex !== null && draggedTabIndex > index && (
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" />
      )}
      <Tooltip>
        <TooltipTrigger render={tabElement as React.ReactElement<Record<string, unknown>>} />
        <TooltipPopup>{sessionHoverTitle}</TooltipPopup>
      </Tooltip>
      {/* Drop indicator - right side */}
      {dropTargetIndex === index && draggedTabIndex !== null && draggedTabIndex < index && (
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" />
      )}
    </div>
  );
}

export function SessionBar({
  sessions,
  activeSessionId,
  activityStateBySessionId,
  repoPath,
  onSelectSession,
  onCloseSession,
  onNewSession,
  onNewSessionWithAgent,
  onOpenLaunchOptions,
  onRenameSession,
  onReorderSessions,
  quickTerminalOpen,
  quickTerminalHasProcess,
  onToggleQuickTerminal,
}: SessionBarProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const providerMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<BarState>(loadState);
  const [dragging, setDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(new Set());
  const dragStart = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  // Provider query and switching logic.
  const queryClient = useQueryClient();
  const providers = useSettingsStore((s) => s.claudeCodeIntegration.providers);
  const showProviderSwitcher = useSettingsStore(
    (s) => s.claudeCodeIntegration.showProviderSwitcher ?? true
  );
  const setClaudeProviderEnabled = useSettingsStore((s) => s.setClaudeProviderEnabled);
  const enableProviderDisableFeature = useSettingsStore(
    (s) => s.claudeCodeIntegration.enableProviderDisableFeature ?? true
  );
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );
  const showClaudeProviderSwitcher = useMemo(
    () => showProviderSwitcher && supportsClaudeProviderSwitcher(activeSession),
    [activeSession, showProviderSwitcher]
  );
  const showPolicyStaleNotice = Boolean(activeSession?.claudePolicyStale);

  const { data: claudeData } = useQuery({
    queryKey: ['claude-settings', repoPath ?? null],
    queryFn: () => window.electronAPI.claudeProvider.readSettings(repoPath),
    enabled: !state.collapsed && showClaudeProviderSwitcher,
    staleTime: 30000,
  });

  // Resolve the currently active provider from the extracted config.
  const activeProvider = useMemo(() => {
    if (!showClaudeProviderSwitcher) {
      return null;
    }
    const currentConfig = claudeData?.extracted;
    if (!currentConfig) return null;
    return providers.find((p) => isClaudeProviderMatch(p, currentConfig)) ?? null;
  }, [providers, claudeData?.extracted, showClaudeProviderSwitcher]);

  // Provider switching mutation.
  const applyProvider = useMutation({
    mutationFn: (provider: ClaudeProvider) =>
      window.electronAPI.claudeProvider.apply(repoPath, provider),
    onSuccess: (success, provider) => {
      if (!success) {
        clearClaudeProviderSwitch();
        const errorCopy = buildSettingsWorkflowToastCopy(
          { action: 'provider-switch', phase: 'error' },
          t
        );
        toastManager.add({
          type: 'error',
          title: errorCopy.title,
          description: errorCopy.description,
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['claude-settings', repoPath ?? null] });
      const successCopy = buildSettingsWorkflowToastCopy(
        {
          action: 'provider-switch',
          phase: 'success',
          name: provider.name,
        },
        t
      );
      toastManager.add({
        type: 'success',
        title: successCopy.title,
        description: successCopy.description,
      });
    },
    onError: (error) => {
      clearClaudeProviderSwitch();
      const errorCopy = buildSettingsWorkflowToastCopy(
        {
          action: 'provider-switch',
          phase: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
        t
      );
      toastManager.add({
        type: 'error',
        title: errorCopy.title,
        description: errorCopy.description,
      });
    },
  });

  // Stable provider mutation wrapper.
  const handleApplyProvider = useCallback(
    (provider: ClaudeProvider) => {
      markClaudeProviderSwitch(provider);
      applyProvider.mutate(provider);
    },
    [applyProvider]
  );

  const handleCloseProviderMenu = useCallback(() => {
    setShowProviderMenu(false);
  }, []);

  // Tab drag reorder state.
  const draggedTabIndexRef = useRef<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Store the drag image element for cleanup.
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  const handleTabDragStart = useCallback((e: React.DragEvent, index: number) => {
    draggedTabIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));

    // Create a lightweight drag image preview.
    const target = e.currentTarget as HTMLElement;
    const computedStyle = window.getComputedStyle(target);
    const textContent = target.querySelector('span')?.textContent || '';

    const dragImage = document.createElement('div');
    dragImage.textContent = textContent;
    dragImage.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      padding: ${computedStyle.padding};
      background-color: ${computedStyle.backgroundColor};
      color: ${computedStyle.color};
      font-size: ${computedStyle.fontSize};
      font-family: ${computedStyle.fontFamily};
      border-radius: 9999px;
      white-space: nowrap;
      pointer-events: none;
    `;

    document.body.appendChild(dragImage);
    dragImageRef.current = dragImage;
    e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);

    // Prevent bar dragging while tab dragging.
    e.stopPropagation();
  }, []);

  const handleTabDragEnd = useCallback(() => {
    // Clean up the drag image.
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    draggedTabIndexRef.current = null;
    setDropTargetIndex(null);
  }, []);

  const handleTabDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedTabIndexRef.current !== null && draggedTabIndexRef.current !== index) {
      setDropTargetIndex(index);
    }
  }, []);

  const handleTabDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleTabDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedTabIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex && onReorderSessions) {
        onReorderSessions(fromIndex, toIndex);
      }
      draggedTabIndexRef.current = null;
      setDropTargetIndex(null);
    },
    [onReorderSessions]
  );

  // Get enabled agents from settings without a local CLI re-scan.
  const { agentSettings, agentDetectionStatus, customAgents, hapiSettings } = useSettingsStore();
  const isRemoteRepo = useMemo(
    () => Boolean(repoPath && isRemoteVirtualPath(repoPath)),
    [repoPath]
  );

  // Build installed agents from persisted local detection or remote runtime probing.
  useEffect(() => {
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
    if (enabledAgentIds.length === 0) {
      setInstalledAgents(new Set());
      return;
    }

    if (!isRemoteRepo || !repoPath) {
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

  // Filter to enabled and installed agents, including WSL/Hapi variants.
  const enabledAgents = Object.keys(agentSettings).filter((id) => {
    if (!agentSettings[id]?.enabled || !installedAgents.has(id)) return false;
    if (id.endsWith('-hapi') && !hapiSettings.enabled) return false;
    if (id.endsWith('-happy') && !hapiSettings.happyEnabled) return false;
    return true;
  });
  // Persist floating bar position and collapse state.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const container = containerRef.current;
    const bar = barRef.current;
    if (!container || !bar) return;

    const syncFloatingBarBounds = () => {
      const containerRect = container.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();

      setState((prev) =>
        clampFloatingBarState(prev, {
          containerWidth: containerRect.width,
          containerHeight: containerRect.height,
          barWidth: barRect.width,
          barHeight: barRect.height,
        })
      );
    };

    const observer = new ResizeObserver(() => {
      syncFloatingBarBounds();
    });

    observer.observe(container);
    observer.observe(bar);
    window.addEventListener('resize', syncFloatingBarBounds);
    syncFloatingBarBounds();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncFloatingBarBounds);
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (state.collapsed) return;
      e.preventDefault();
      setDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        startX: state.x,
        startY: state.y,
      };
    },
    [state.collapsed, state.x, state.y]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;

      const newX = Math.max(0, Math.min(100, dragStart.current.startX + (dx / rect.width) * 100));
      const newY = Math.max(8, Math.min(rect.height - 48, dragStart.current.startY + dy));

      setState((s) => ({ ...s, x: newX, y: newY }));
    };

    const handleMouseUp = () => {
      setDragging(false);
      if (!containerRef.current || !barRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const barRect = barRef.current.getBoundingClientRect();

      // Check the bar's left edge distance from the container's left edge.
      const leftEdgeDist = barRect.left - containerRect.left;
      // Check the bar's right edge distance from the container's right edge.
      const rightEdgeDist = containerRect.right - barRect.right;

      setState((s) => {
        if (leftEdgeDist < EDGE_THRESHOLD) {
          return { ...s, x: 0, collapsed: true, edge: 'left' };
        }
        if (rightEdgeDist < EDGE_THRESHOLD) {
          return { ...s, x: 100, collapsed: true, edge: 'right' };
        }
        return s;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const handleExpand = useCallback(() => {
    if (!state.collapsed) return;
    setState((s) => ({ ...s, x: 50, collapsed: false, edge: null }));
  }, [state.collapsed]);

  const handleStartEdit = useCallback((session: Session) => {
    setEditingId(session.id);
    setEditingName(getSessionDisplayName(session));
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const handleFinishEdit = useCallback(() => {
    if (editingId && editingName.trim()) {
      onRenameSession(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, onRenameSession]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleFinishEdit();
      } else if (e.key === 'Escape') {
        setEditingId(null);
        setEditingName('');
      }
    },
    [handleFinishEdit]
  );

  const handleTabSelectionByIndex = useCallback(
    (targetIndex: number) => {
      const targetSession = sessions[targetIndex];
      if (!targetSession) return;
      onSelectSession(targetSession.id);
      const targetTab = document.getElementById(buildSessionTabId(targetSession.id));
      window.requestAnimationFrame(() => targetTab?.focus());
    },
    [onSelectSession, sessions]
  );

  const handleSessionTabKeyDown = useCallback(
    (sessionId: string, event: React.KeyboardEvent) => {
      const currentIndex = sessions.findIndex((session) => session.id === sessionId);
      if (currentIndex < 0) return;

      switch (event.key) {
        case 'ArrowRight': {
          event.preventDefault();
          const nextIndex = (currentIndex + 1) % sessions.length;
          handleTabSelectionByIndex(nextIndex);
          return;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          const nextIndex = currentIndex <= 0 ? sessions.length - 1 : currentIndex - 1;
          handleTabSelectionByIndex(nextIndex);
          return;
        }
        case 'Home': {
          event.preventDefault();
          handleTabSelectionByIndex(0);
          return;
        }
        case 'End': {
          event.preventDefault();
          handleTabSelectionByIndex(sessions.length - 1);
          return;
        }
        default:
          return;
      }
    },
    [handleTabSelectionByIndex, sessions]
  );

  const handleToggleAgentMenu = useCallback(() => {
    setShowProviderMenu(false);
    setShowAgentMenu((prev) => !prev);
  }, []);

  const handleToggleProviderMenu = useCallback(() => {
    setShowAgentMenu(false);
    setShowProviderMenu((prev) => !prev);
  }, []);

  const handleCreateDefaultSession = useCallback(() => {
    setShowAgentMenu(false);
    setShowProviderMenu(false);
    onNewSession();
  }, [onNewSession]);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      // Handle Hapi and Happy agent IDs.
      const isHapi = agentId.endsWith('-hapi');
      const isHappy = agentId.endsWith('-happy');
      const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;

      const customAgent = customAgents.find((a) => a.id === baseId);
      const info = customAgent
        ? { name: customAgent.name, command: customAgent.command }
        : AGENT_INFO[baseId] || { name: 'Claude', command: 'claude' };

      onNewSessionWithAgent?.(agentId, info.command);
      setShowAgentMenu(false);
    },
    [customAgents, onNewSessionWithAgent]
  );

  const handleOpenLaunchOptions = useCallback(
    (agentId: string) => {
      const isHapi = agentId.endsWith('-hapi');
      const isHappy = agentId.endsWith('-happy');
      const baseId = isHapi ? agentId.slice(0, -5) : isHappy ? agentId.slice(0, -6) : agentId;
      const customAgent = customAgents.find((a) => a.id === baseId);
      const info = customAgent
        ? { name: customAgent.name, command: customAgent.command }
        : AGENT_INFO[baseId] || { name: 'Claude', command: 'claude' };

      onOpenLaunchOptions?.(agentId, info.command);
      setShowAgentMenu(false);
    },
    [customAgents, onOpenLaunchOptions]
  );

  useEffect(() => {
    if (!showClaudeProviderSwitcher && showProviderMenu) {
      setShowProviderMenu(false);
    }
  }, [showClaudeProviderSwitcher, showProviderMenu]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (agentMenuRef.current && !agentMenuRef.current.contains(target)) {
        setShowAgentMenu(false);
      }

      if (providerMenuRef.current && !providerMenuRef.current.contains(target)) {
        setShowProviderMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <div
        ref={barRef}
        onClick={state.collapsed ? handleExpand : undefined}
        onKeyDown={state.collapsed ? (e) => e.key === 'Enter' && handleExpand() : undefined}
        role={state.collapsed ? 'button' : undefined}
        tabIndex={state.collapsed ? 0 : undefined}
        className={cn(
          'absolute max-w-[calc(100%-1rem)] pointer-events-auto',
          !dragging && 'transition-all duration-300',
          state.collapsed ? 'cursor-pointer' : dragging ? 'cursor-grabbing' : ''
        )}
        style={{
          ...(state.collapsed && state.edge === 'right'
            ? { right: 0, left: 'auto' }
            : state.collapsed && state.edge === 'left'
              ? { left: 0 }
              : state.x > 90
                ? { right: `${100 - state.x}%` }
                : { left: `${state.x}%` }),
          top: state.y,
          transform: state.collapsed
            ? 'none'
            : state.x > 90
              ? 'translateX(50%)'
              : 'translateX(-50%)',
        }}
      >
        {state.collapsed ? (
          <div
            title={t('Expand session controls')}
            className={cn(
              SESSION_BAR_COLLAPSED_BUTTON_CLASS_NAME,
              state.edge === 'left' && 'rounded-l-md',
              state.edge === 'right' && 'rounded-r-md'
            )}
          >
            <RectangleEllipsis className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : (
          <div
            role="toolbar"
            aria-label={t('Agent session controls')}
            className="control-toolbar flex w-full max-w-full min-w-0 flex-col gap-2 rounded-2xl px-2 py-1.5"
          >
            {showPolicyStaleNotice ? (
              <div className="flex w-full items-start gap-2 rounded-xl border border-warning/45 bg-warning/8 px-3 py-2 text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1 ui-type-meta">
                  {t('Skill and MCP settings changed. Restart sessions to apply.')}
                </div>
              </div>
            ) : null}

            <div className="flex w-full items-center gap-1">
              <div
                role="group"
                aria-label={t('Active sessions')}
                className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div
                  title={t('Move session controls')}
                  className="flex h-7 w-4 cursor-grab items-center justify-center text-muted-foreground/50"
                  onMouseDown={handleMouseDown}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </div>

                <div
                  role="tablist"
                  aria-label={t('Agent sessions')}
                  className="flex min-w-max items-center gap-1"
                >
                  {sessions.map((session, index) => (
                    <SessionTab
                      key={session.id}
                      session={session}
                      activityState={activityStateBySessionId?.[session.id]}
                      index={index}
                      tabId={buildSessionTabId(session.id)}
                      panelId={buildSessionPanelId(session.id)}
                      isActive={activeSessionId === session.id}
                      isEditing={editingId === session.id}
                      editingName={editingName}
                      isDragging={draggedTabIndexRef.current === index}
                      dropTargetIndex={dropTargetIndex}
                      draggedTabIndex={draggedTabIndexRef.current}
                      inputRef={inputRef}
                      onSelect={() => onSelectSession(session.id)}
                      onClose={() => onCloseSession(session.id)}
                      onStartEdit={() => handleStartEdit(session)}
                      onEditingNameChange={setEditingName}
                      onFinishEdit={handleFinishEdit}
                      onEditKeyDown={handleKeyDown}
                      onTabKeyDown={(event) => handleSessionTabKeyDown(session.id, event)}
                      onDragStart={(e) => handleTabDragStart(e, index)}
                      onDragEnd={handleTabDragEnd}
                      onDragOver={(e) => handleTabDragOver(e, index)}
                      onDragLeave={handleTabDragLeave}
                      onDrop={(e) => handleTabDrop(e, index)}
                    />
                  ))}
                </div>
              </div>

              <div
                role="group"
                aria-label={t('Session actions')}
                className="flex shrink-0 items-center gap-1"
              >
                <div className="control-divider mx-1 h-5 w-px" />

                <div ref={agentMenuRef} className="relative">
                  <div className={SESSION_BAR_SPLIT_ACTION_GROUP_CLASS_NAME}>
                    <button
                      type="button"
                      aria-label={t('Create default session')}
                      onClick={handleCreateDefaultSession}
                      className={SESSION_BAR_SPLIT_PRIMARY_ACTION_BUTTON_CLASS_NAME}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('Choose session agent')}
                      aria-haspopup="menu"
                      aria-expanded={showAgentMenu}
                      onClick={handleToggleAgentMenu}
                      className={cn(
                        SESSION_BAR_SPLIT_TOGGLE_ACTION_BUTTON_CLASS_NAME,
                        showAgentMenu && 'control-icon-button-active'
                      )}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {showAgentMenu && (
                    <div
                      role="menu"
                      aria-label={t('Select Agent')}
                      className={cn(
                        'absolute right-0 z-50 min-w-40',
                        containerRef.current &&
                          state.y > containerRef.current.getBoundingClientRect().height / 2
                          ? 'origin-bottom-right bottom-full pb-1'
                          : 'origin-top-right top-full pt-1'
                      )}
                    >
                      <div className="control-menu rounded-2xl p-2">
                        <div className="mb-1 flex items-center justify-between px-1 py-1">
                          <span className="control-menu-label text-muted-foreground">
                            {t('Select Agent')}
                          </span>
                          <Tooltip>
                            <TooltipTrigger render={<span />}>
                              <button
                                type="button"
                                aria-label={t('Agent profiles')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowAgentMenu(false);
                                  window.dispatchEvent(new CustomEvent('open-settings-agent'));
                                }}
                                className={SESSION_BAR_MENU_BUTTON_CLASS_NAME}
                              >
                                <Settings className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipPopup side="right">{t('Agent profiles')}</TooltipPopup>
                          </Tooltip>
                        </div>
                        {[...enabledAgents]
                          .sort((a, b) => {
                            const aDefault = agentSettings[a]?.isDefault ? 1 : 0;
                            const bDefault = agentSettings[b]?.isDefault ? 1 : 0;
                            return bDefault - aDefault;
                          })
                          .map((agentId) => {
                            const isHapi = agentId.endsWith('-hapi');
                            const isHappy = agentId.endsWith('-happy');
                            const baseId = isHapi
                              ? agentId.slice(0, -5)
                              : isHappy
                                ? agentId.slice(0, -6)
                                : agentId;
                            const customAgent = customAgents.find((a) => a.id === baseId);
                            const info = customAgent
                              ? { name: customAgent.name, command: customAgent.command }
                              : AGENT_INFO[baseId] || { name: baseId, command: 'claude' };
                            const baseName = info.name;
                            const name = isHapi
                              ? `${baseName} (Hapi)`
                              : isHappy
                                ? `${baseName} (Happy)`
                                : baseName;
                            const isDefault = agentSettings[agentId]?.isDefault;
                            const canOpenLaunchOptions = supportsAgentCapabilityPolicyLaunch(
                              agentId,
                              info.command
                            );
                            return (
                              <div key={agentId} className="mt-1 flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAgent(agentId)}
                                  className="control-menu-item flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-foreground"
                                >
                                  <span className="min-w-0 flex-1 truncate">{name}</span>
                                  {isDefault ? (
                                    <span className="control-chip control-chip-strong shrink-0">
                                      {t('Default')}
                                    </span>
                                  ) : null}
                                </button>
                                {canOpenLaunchOptions ? (
                                  <button
                                    type="button"
                                    aria-label={t('Skill & MCP')}
                                    title={t('Skill & MCP')}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOpenLaunchOptions(agentId);
                                    }}
                                    className={cn(
                                      SESSION_BAR_MENU_UTILITY_BUTTON_CLASS_NAME,
                                      'h-9 w-9 shrink-0 rounded-lg'
                                    )}
                                  >
                                    <Settings2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {!state.collapsed && showClaudeProviderSwitcher && (
                  <>
                    <div className="control-divider mx-1 h-4 w-px" />

                    <div ref={providerMenuRef} className="relative shrink-0">
                      <button
                        type="button"
                        aria-label={activeProvider?.name ?? t('Select Provider')}
                        aria-haspopup="menu"
                        aria-expanded={showProviderMenu}
                        onClick={handleToggleProviderMenu}
                        className={cn(
                          SESSION_BAR_TOOLBAR_BUTTON_CLASS_NAME,
                          showProviderMenu && 'control-icon-button-active'
                        )}
                        title={activeProvider?.name ?? t('Select Provider')}
                      >
                        <svg
                          fill="currentColor"
                          fillRule="evenodd"
                          height="1em"
                          className="h-3.5 w-3.5 shrink-0"
                          viewBox="0 0 24 24"
                          width="1em"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <title>Claude</title>
                          <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
                        </svg>
                      </button>

                      {showProviderMenu && providers.length > 0 && (
                        <div
                          role="menu"
                          aria-label={t('Select Provider')}
                          className={cn(
                            'absolute right-0 z-50 min-w-40',
                            containerRef.current &&
                              state.y > containerRef.current.getBoundingClientRect().height / 2
                              ? 'origin-bottom-right bottom-full pb-1'
                              : 'origin-top-right top-full pt-1'
                          )}
                        >
                          <div className="control-menu rounded-2xl p-2">
                            <div className="mb-1 flex items-center justify-between px-1 py-1">
                              <span className="control-menu-label whitespace-nowrap text-muted-foreground">
                                {t('Select Provider')}
                              </span>
                              <Tooltip>
                                <TooltipTrigger render={<span />}>
                                  <button
                                    type="button"
                                    aria-label={t('Manage Providers')}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowProviderMenu(false);
                                      window.dispatchEvent(
                                        new CustomEvent('open-settings-provider')
                                      );
                                    }}
                                    className={SESSION_BAR_MENU_BUTTON_CLASS_NAME}
                                  >
                                    <Settings className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipPopup side="right">{t('Manage Providers')}</TooltipPopup>
                              </Tooltip>
                            </div>
                            {providers.map((provider) => {
                              const isActive = activeProvider?.id === provider.id;
                              const isDisabled = provider.enabled === false;

                              return (
                                <ProviderMenuItem
                                  key={provider.id}
                                  provider={provider}
                                  isActive={isActive}
                                  isDisabled={isDisabled}
                                  isPending={applyProvider.isPending}
                                  activeProviderId={activeProvider?.id}
                                  providers={providers}
                                  onApplyProvider={handleApplyProvider}
                                  onCloseMenu={handleCloseProviderMenu}
                                  setClaudeProviderEnabled={setClaudeProviderEnabled}
                                  enableProviderDisableFeature={enableProviderDisableFeature}
                                  t={t}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {!state.collapsed && onToggleQuickTerminal && (
                  <>
                    <div className="control-divider mx-1 h-4 w-px" />
                    <Tooltip>
                      <TooltipTrigger render={<span />}>
                        <button
                          type="button"
                          aria-label={t('Quick Terminal')}
                          onClick={onToggleQuickTerminal}
                          className={cn(
                            SESSION_BAR_TOOLBAR_BUTTON_CLASS_NAME,
                            quickTerminalOpen
                              ? 'control-icon-button-active'
                              : quickTerminalHasProcess
                                ? 'control-icon-button-live'
                                : undefined
                          )}
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipPopup>{t('Quick Terminal')} (Ctrl+`)</TooltipPopup>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
