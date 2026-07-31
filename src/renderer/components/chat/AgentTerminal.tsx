import { TEMP_INPUT_FILE_PREFIX } from '@shared/paths';
import type {
  AgentSessionTitleSource,
  AgentSubagentTranscriptEntry,
  ClaudeIdeBridgeStatus,
  ClaudePolicyConfig,
  ClaudePolicyMaterializationMode,
  PersistentAgentRuntimeState,
  SessionRuntimeState,
} from '@shared/types';
import { TASK_COMPLETION_MARKER } from '@shared/types/agent';
import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import {
  getClaudeGlobalPolicy,
  getClaudeProjectPolicy,
  getClaudeWorktreePolicy,
  getProjectConfigSchemeSelection,
  getWorktreeConfigSchemeSelection,
} from '@/App/storage';
import {
  TerminalSearchBar,
  type TerminalSearchBarRef,
} from '@/components/terminal/TerminalSearchBar';
import { toastManager } from '@/components/ui/toast';
import { useAgentProviderSessionDiscovery } from '@/hooks/useAgentProviderSessionDiscovery';
import { useAgentProviderSessionTitle } from '@/hooks/useAgentProviderSessionTitle';
import { useRepositoryRuntimeContext } from '@/hooks/useRepositoryRuntimeContext';
import { useTerminalScrollToBottom } from '@/hooks/useTerminalScrollToBottom';
import { useXterm } from '@/hooks/useXterm';
import {
  copyTerminalSelectionToClipboard,
  readClipboardText,
  restoreTerminalInteractionAfterCopy,
  writeClipboardText,
} from '@/hooks/xtermClipboard';
import { scheduleXtermContainerReady } from '@/hooks/xtermContainerReady';
import { focusXtermTextInput } from '@/hooks/xtermTextInputFocus';
import { useI18n } from '@/i18n';
import { AGENT_ATTACHMENT_PASTE_EVENT_NAME } from '@/lib/agentAttachmentPasteEvent';
import { shouldPersistAgentSessionOnDisconnect } from '@/lib/agentSessionPersistence';
import { emitRendererAgentStop } from '@/lib/agentStopEvents';
import { showRendererNotification } from '@/lib/electronNotification';
import {
  buildChatInputToastCopy,
  buildChatNotificationCopy,
  buildFileWorkflowToastCopy,
} from '@/lib/feedbackCopy';
import { isNativeImeCompositionKeyEvent } from '@/lib/imeKeyboardEvent';
import {
  resolveTerminalRuntimeOverlayState,
  type TerminalRuntimeOverlayState,
} from '@/lib/terminalRuntimeOverlay';
import { cn } from '@/lib/utils';
import { type OutputState, useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import {
  type AgentAttachmentSource,
  DRAFT_ATTACHMENT_MAX_BYTES,
  resolveAgentAttachmentTargetsFromFiles,
} from './agentAttachmentInput';
import {
  type AgentAttachmentItem,
  buildAgentAttachmentInsertText,
  buildAgentAttachmentMessage,
  mergeAgentAttachments,
  resolveAgentAttachmentSendDelay,
} from './agentAttachmentTrayModel';
import { AGENT_CANVAS_SCROLL_SURFACE_ATTRIBUTE } from './agentCanvasInteractionPolicy';
import {
  buildAgentCapabilityLaunchMetadata,
  extractAgentCapabilitySessionMetadata,
} from './agentCapabilityLaunch';
import { resolveFallbackCommandShell } from './agentCommandShellFallback';
import {
  AGENT_CHAT_FLOATING_ACTION_BUTTON_SIZE_CLASS,
  AGENT_CHAT_SCROLL_TO_BOTTOM_OFFSET_CLASS,
} from './agentFloatingControlLayout';
import {
  resolveAgentInputAvailability,
  resolveAgentInputUnavailableReason,
} from './agentInputAvailability';
import { supportsAgentNativeTerminalInput } from './agentInputMode';
import {
  AGENT_STARTUP_STALL_THRESHOLD_MS,
  resolveAgentStartupOverlayPresentation,
} from './agentStartupOverlay';
import { shouldShowAgentStartupOverlayForVisibility } from './agentStartupVisibilityPolicy';
import { resolveAgentTerminalActivityPollIntervalMs } from './agentTerminalActivityPollingPolicy';
import { resolveAgentTerminalAttachmentInsertDisposition } from './agentTerminalAttachmentInsertPolicy';
import {
  collectAgentTerminalClipboardFiles,
  hasAgentTerminalClipboardImageSignal,
  isEditableAgentTerminalClipboardPasteTarget,
  shouldCaptureAgentTerminalClipboardFiles,
} from './agentTerminalClipboardPastePolicy';
import { buildAgentTerminalContextMenuItems } from './agentTerminalContextMenu';
import {
  INTERRUPT_OUTPUT_IDLE_SETTLE_MS,
  isAgentTerminalInterruptKeyEvent,
  shouldForceAgentTerminalIdleAfterInterrupt,
} from './agentTerminalInterruptPolicy';
import { resolveAgentTerminalLaunchPlan } from './agentTerminalLaunchPlan';
import {
  appendRecentAgentOutput,
  hasRenderableAgentTerminalOutput,
  resolveCopyableAgentOutputBlock,
} from './agentTerminalOutput';
import { shouldRetryDeadAgentSession } from './agentTerminalRecoveryPolicy';
import { formatAgentTranscriptForTerminal } from './agentTranscriptTerminalFormat';
import { extractClaudePolicySessionMetadata } from './claudePolicyLaunch';
import { isClaudeWorkspaceTrustPrompt } from './claudeTrustPrompt';
import { resolveProjectConfigSchemeLaunchState } from './projectConfigSchemeLaunch';

export interface AgentTerminalReadOnlyTranscript {
  entries: AgentSubagentTranscriptEntry[];
  identity?: string;
}

interface AgentTerminalProps {
  id?: string; // Terminal session ID (UI key)
  createdAt?: number;
  repoPath?: string;
  cwd?: string;
  sessionId?: string; // Provider session ID for agent-level resume flows (falls back to id)
  backendSessionId?: string; // Unified backend session ID for attach/resume
  agentId?: string; // Agent ID (e.g., 'claude', 'codex', 'gemini')
  agentCommand?: string;
  customPath?: string; // custom absolute path to the agent CLI
  customArgs?: string; // additional arguments to pass to the agent
  environment?: 'native' | 'hapi' | 'happy';
  initialized?: boolean;
  activated?: boolean;
  persistenceEnabled?: boolean;
  hostSessionKey?: string;
  recovered?: boolean;
  recoveryState?: PersistentAgentRuntimeState;
  isActive?: boolean;
  isVisible?: boolean;
  preferCompatibilityRenderer?: boolean;
  terminalFontScale?: number;
  hasPendingCommand?: boolean; // Allow initial command execution before the terminal is visible.
  initialPrompt?: string; // Initial prompt to pass as CLI argument (auto-execute)
  sessionPolicy?: ClaudePolicyConfig | null;
  materializationMode?: ClaudePolicyMaterializationMode;
  canMerge?: boolean; // whether merge option should be enabled (has multiple groups)
  layoutRefreshKey?: string;
  /**
   * When provided, Enhanced Input open state is controlled by parent (e.g. AgentPanel store).
   * When omitted, AgentTerminal falls back to its own local state.
   */
  enhancedInputOpen?: boolean;
  onEnhancedInputOpenChange?: (open: boolean) => void;
  onInitialized?: () => void;
  onActivated?: () => void;
  /** Called after a successful enhanced-input dispatch with its first meaningful line. */
  onActivatedWithFirstLine?: (line: string) => void;
  titleSource?: AgentSessionTitleSource;
  onProviderSessionTitle?: (title: string) => void;
  onExit?: () => void;
  onSplit?: () => void;
  onMerge?: () => void;
  onFocus?: () => void; // called when terminal is clicked/focused to activate the group
  onRegisterEnhancedInputSender?: (
    sessionId: string,
    sender: (content: string, attachments: AgentAttachmentItem[]) => boolean
  ) => void;
  onUnregisterEnhancedInputSender?: (sessionId: string) => void;
  onBackendSessionIdChange?: (sessionId: string) => void;
  onProviderSessionIdChange?: (sessionId: string) => void;
  onProviderSessionIdentityValidityChange?: (valid: boolean) => void;
  onReplaySnapshotChange?: (snapshot: string | undefined, capturedAt: number | undefined) => void;
  onRuntimeStateChange?: (state: SessionRuntimeState) => void;
  onClaudePolicyStateChange?: (state: {
    provider?: 'claude' | 'codex' | 'gemini';
    hash: string;
    warnings: string[];
  }) => void;
  readOnlyTranscript?: AgentTerminalReadOnlyTranscript | null;
  replaySnapshot?: string;
}

const MIN_OUTPUT_FOR_NOTIFICATION = 100; // Minimum chars to consider agent is doing work
const MIN_OUTPUT_FOR_INDICATOR = 200; // Minimum chars to show "outputting" indicator (higher to avoid noise)
const IDLE_CONFIRMATION_COUNT = 2; // Require 2 consecutive idle polls (2 seconds) before marking as idle
const RECENT_OUTPUT_TIMEOUT_MS = 3000; // If output received within this time, consider still active
const AGENT_TERMINAL_FLOATING_CONTROL_ATTRIBUTE = 'data-agent-terminal-floating-control';
const MOUSE_SELECTION_AUTO_SCROLL_EDGE_PX = 32;
const MOUSE_SELECTION_AUTO_SCROLL_INTERVAL_MS = 50;
const MOUSE_SELECTION_AUTO_SCROLL_MAX_LINES = 4;

function getFirstMeaningfulInputLine(input?: string | null): string | undefined {
  return input
    ?.split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
}

interface MouseSelectionPosition {
  clientX: number;
  clientY: number;
}

interface MouseSelectionTarget {
  bounds: DOMRect;
  element: HTMLElement;
}

interface AgentTerminalRuntimeOverlayPresentation {
  descriptionKey: string;
  showRetry: boolean;
  titleKey: string;
}

function resolveAgentTerminalRuntimeOverlayPresentation({
  isRemoteExecution,
  state,
}: {
  isRemoteExecution: boolean;
  state: TerminalRuntimeOverlayState;
}): AgentTerminalRuntimeOverlayPresentation {
  if (isRemoteExecution) {
    return state === 'reconnecting'
      ? {
          descriptionKey: 'Remote terminal input is temporarily disabled while reconnecting.',
          showRetry: false,
          titleKey: 'Remote terminal reconnecting...',
        }
      : {
          descriptionKey:
            'Remote terminal has disconnected. Reconnect the remote host to continue.',
          showRetry: false,
          titleKey: 'Remote terminal disconnected',
        };
  }

  return state === 'reconnecting'
    ? {
        descriptionKey: 'Terminal input is temporarily disabled while the session reconnects.',
        showRetry: false,
        titleKey: 'Terminal session reconnecting...',
      }
    : {
        descriptionKey: 'Terminal session is unavailable. Start a fresh session to continue.',
        showRetry: true,
        titleKey: 'Terminal session unavailable',
      };
}

function resolveMouseSelectionTarget(container: HTMLElement): MouseSelectionTarget {
  const screen = container.querySelector<HTMLElement>('.xterm-screen');
  if (screen) {
    const screenBounds = screen.getBoundingClientRect();
    if (screenBounds.width > 0 && screenBounds.height > 0) {
      return {
        bounds: screenBounds,
        element: screen,
      };
    }

    return {
      bounds: container.getBoundingClientRect(),
      element: screen,
    };
  }

  return {
    bounds: container.getBoundingClientRect(),
    element: container,
  };
}

function resolveMouseSelectionAutoScrollLines(
  target: MouseSelectionTarget,
  clientY: number
): number {
  const { bounds } = target;
  if (bounds.height <= 0) {
    return 0;
  }

  const distanceFromTop = clientY - bounds.top;
  const distanceFromBottom = bounds.bottom - clientY;
  if (distanceFromTop < MOUSE_SELECTION_AUTO_SCROLL_EDGE_PX) {
    const intensity =
      (MOUSE_SELECTION_AUTO_SCROLL_EDGE_PX - distanceFromTop) / MOUSE_SELECTION_AUTO_SCROLL_EDGE_PX;
    return -Math.min(
      MOUSE_SELECTION_AUTO_SCROLL_MAX_LINES,
      Math.max(1, Math.ceil(intensity * MOUSE_SELECTION_AUTO_SCROLL_MAX_LINES))
    );
  }

  if (distanceFromBottom < MOUSE_SELECTION_AUTO_SCROLL_EDGE_PX) {
    const intensity =
      (MOUSE_SELECTION_AUTO_SCROLL_EDGE_PX - distanceFromBottom) /
      MOUSE_SELECTION_AUTO_SCROLL_EDGE_PX;
    return Math.min(
      MOUSE_SELECTION_AUTO_SCROLL_MAX_LINES,
      Math.max(1, Math.ceil(intensity * MOUSE_SELECTION_AUTO_SCROLL_MAX_LINES))
    );
  }

  return 0;
}

function dispatchMouseSelectionMoveToXterm(
  target: MouseSelectionTarget,
  position: MouseSelectionPosition
): void {
  const { bounds, element } = target;
  const clientX = Math.min(Math.max(position.clientX, bounds.left + 1), bounds.right - 1);
  const clientY = Math.min(Math.max(position.clientY, bounds.top + 1), bounds.bottom - 1);

  element.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX,
      clientY,
    })
  );
}

function hasResolvedProviderSessionId(
  uiSessionId: string | undefined,
  providerSessionId: string | undefined
): boolean {
  if (!providerSessionId) {
    return false;
  }

  if (!uiSessionId) {
    return true;
  }

  return providerSessionId !== uiSessionId;
}

function getAttachmentTempExtension(file: File): string {
  const mime = file.type.toLowerCase();
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'image/tiff': 'tiff',
    'image/x-icon': 'ico',
  };
  const mapped = mimeMap[mime];
  if (mapped) {
    return mapped;
  }

  const lastDot = file.name.lastIndexOf('.');
  if (lastDot > 0 && lastDot < file.name.length - 1) {
    const extension = file.name.slice(lastDot + 1).toLowerCase();
    if (/^[a-z0-9]{1,10}$/.test(extension)) {
      return extension;
    }
  }

  return 'png';
}

function resolveClipboardImageTempFormat(file: File): 'png' | 'jpeg' {
  const mime = file.type.toLowerCase();
  return mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpeg' : 'png';
}

function isAgentTerminalFloatingControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(`[${AGENT_TERMINAL_FLOATING_CONTROL_ATTRIBUTE}="true"]`) !== null
  );
}

export function AgentTerminal({
  id,
  createdAt,
  repoPath,
  cwd,
  sessionId,
  backendSessionId,
  agentId = 'claude',
  agentCommand = 'claude',
  customPath,
  customArgs,
  environment = 'native',
  initialized,
  activated,
  persistenceEnabled = false,
  hostSessionKey,
  recovered = false,
  recoveryState,
  isActive = false,
  isVisible = isActive,
  preferCompatibilityRenderer = false,
  terminalFontScale,
  hasPendingCommand = false,
  initialPrompt,
  sessionPolicy,
  materializationMode,
  canMerge = false,
  layoutRefreshKey,
  enhancedInputOpen: externalEnhancedInputOpen,
  onEnhancedInputOpenChange,
  onInitialized,
  onActivated,
  onActivatedWithFirstLine,
  titleSource,
  onProviderSessionTitle,
  onExit,
  onSplit,
  onMerge,
  onFocus,
  onRegisterEnhancedInputSender,
  onUnregisterEnhancedInputSender,
  onBackendSessionIdChange,
  onProviderSessionIdChange,
  onProviderSessionIdentityValidityChange,
  onReplaySnapshotChange,
  onRuntimeStateChange,
  onClaudePolicyStateChange,
  readOnlyTranscript = null,
  replaySnapshot,
}: AgentTerminalProps) {
  const { t } = useI18n();
  const isReadOnlyTranscript = readOnlyTranscript !== null;
  const transcriptTerminalText = useMemo(
    () => (readOnlyTranscript ? formatAgentTranscriptForTerminal(readOnlyTranscript.entries) : ''),
    [readOnlyTranscript]
  );
  const transcriptIdentity = readOnlyTranscript?.identity ?? transcriptTerminalText;
  const transcriptStaticContent = useMemo(
    () =>
      readOnlyTranscript
        ? {
            text: transcriptTerminalText,
            identity: transcriptIdentity,
          }
        : undefined,
    [readOnlyTranscript, transcriptIdentity, transcriptTerminalText]
  );
  const {
    agentNotificationEnabled,
    agentNotificationDelay,
    agentNotificationEnterDelay,
    hapiSettings,
    shellConfig,
    agentIntegration,
    projectConfigSchemes,
    promptPresets,
  } = useSettingsStore(
    useShallow((state) => ({
      agentNotificationEnabled: state.agentNotificationEnabled,
      agentNotificationDelay: state.agentNotificationDelay,
      agentNotificationEnterDelay: state.agentNotificationEnterDelay,
      hapiSettings: state.hapiSettings,
      shellConfig: state.shellConfig,
      agentIntegration: state.agentIntegration,
      projectConfigSchemes: state.projectConfigSchemes,
      promptPresets: state.promptPresets,
    }))
  );
  const { data: runtimeContext } = useRepositoryRuntimeContext(cwd);
  const isRemoteExecution = runtimeContext?.kind === 'remote';
  const executionPlatform = window.electronAPI?.env?.platform;
  const runtimeChannel = window.electronAPI?.env?.runtimeChannel ?? 'prod';

  // Track if hapi is globally installed (cached in main process)
  const [hapiGlobalInstalled, setHapiGlobalInstalled] = useState<boolean | null>(null);
  const [claudeIdeStatus, setClaudeIdeStatus] = useState<ClaudeIdeBridgeStatus | null>(null);
  const [claudeWorkspaceTrusted, setClaudeWorkspaceTrusted] = useState<boolean | null>(null);
  const [startupProbeRetryNonce, setStartupProbeRetryNonce] = useState(0);
  const [hasRenderableTerminalOutput, setHasRenderableTerminalOutput] = useState(() =>
    hasRenderableAgentTerminalOutput(replaySnapshot ?? '')
  );

  // Resolved shell for command execution
  const [resolvedShell, setResolvedShell] = useState<{
    shell: string;
    execArgs: string[];
  } | null>(null);

  // Resolve shell configuration on mount and when shellConfig changes
  useEffect(() => {
    let cancelled = false;

    if (isReadOnlyTranscript) {
      setResolvedShell({
        shell: '',
        execArgs: [],
      });
      return () => {
        cancelled = true;
      };
    }

    if (startupProbeRetryNonce > 0) {
      setResolvedShell(null);
    }

    if (isRemoteExecution) {
      setResolvedShell(null);
      return () => {
        cancelled = true;
      };
    }

    window.electronAPI.shell
      .resolveForCommand(cwd, shellConfig)
      .then((nextShell) => {
        if (!cancelled) {
          setResolvedShell(nextShell);
        }
      })
      .catch((error) => {
        console.warn('[AgentTerminal] Failed to resolve shell for command execution', error);
        if (!cancelled) {
          setResolvedShell(resolveFallbackCommandShell(executionPlatform, shellConfig));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    cwd,
    executionPlatform,
    isReadOnlyTranscript,
    isRemoteExecution,
    shellConfig,
    startupProbeRetryNonce,
  ]);

  // Check hapi global installation on mount (only for hapi environment)
  useEffect(() => {
    let cancelled = false;

    if (isReadOnlyTranscript) {
      setHapiGlobalInstalled(true);
      return () => {
        cancelled = true;
      };
    }

    if (environment === 'hapi') {
      if (startupProbeRetryNonce > 0) {
        setHapiGlobalInstalled(null);
      }
      window.electronAPI.hapi
        .checkGlobal(cwd, false)
        .then((status) => {
          if (!cancelled) {
            setHapiGlobalInstalled(status.installed);
          }
        })
        .catch((error) => {
          console.warn('[AgentTerminal] Failed to probe hapi availability', error);
          if (!cancelled) {
            setHapiGlobalInstalled(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }

    setHapiGlobalInstalled(true);
    return () => {
      cancelled = true;
    };
  }, [cwd, environment, isReadOnlyTranscript, startupProbeRetryNonce]);

  useEffect(() => {
    let cancelled = false;

    if (isReadOnlyTranscript) {
      setClaudeIdeStatus({
        enabled: false,
        port: null,
        workspaceFolders: [],
        hasMatchingWorkspace: false,
        matchingWorkspaceLockCount: 0,
        canUseIde: false,
        reason: 'bridge-disabled',
      });
      return;
    }

    if (!agentCommand.startsWith('claude')) {
      setClaudeIdeStatus(null);
      return;
    }

    if (!agentIntegration.enabled) {
      setClaudeIdeStatus({
        enabled: false,
        port: null,
        workspaceFolders: [],
        hasMatchingWorkspace: false,
        matchingWorkspaceLockCount: 0,
        canUseIde: false,
        reason: 'bridge-disabled',
      });
      return;
    }

    if (startupProbeRetryNonce > 0) {
      setClaudeIdeStatus(null);
    }
    window.electronAPI.mcp
      .getStatus(cwd)
      .then((status) => {
        if (!cancelled) {
          setClaudeIdeStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          console.warn('[AgentTerminal] Failed to resolve Claude IDE readiness');
          setClaudeIdeStatus({
            enabled: false,
            port: null,
            workspaceFolders: [],
            hasMatchingWorkspace: false,
            matchingWorkspaceLockCount: 0,
            canUseIde: false,
            reason: 'bridge-disabled',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentCommand, agentIntegration.enabled, cwd, isReadOnlyTranscript, startupProbeRetryNonce]);
  useEffect(() => {
    let cancelled = false;
    hasAutoConfirmedTrustPromptRef.current = false;

    if (isReadOnlyTranscript) {
      setClaudeWorkspaceTrusted(true);
      return;
    }

    if (!agentCommand.startsWith('claude') || isRemoteExecution || !cwd) {
      setClaudeWorkspaceTrusted(true);
      return;
    }

    if (startupProbeRetryNonce > 0) {
      setClaudeWorkspaceTrusted(null);
    }
    window.electronAPI.claudeConfig.projectTrust
      .ensureWorkspaceTrusted(cwd)
      .then((trusted) => {
        if (!cancelled) {
          setClaudeWorkspaceTrusted(trusted);
        }
      })
      .catch(() => {
        if (!cancelled) {
          console.warn('[AgentTerminal] Failed to resolve Claude workspace trust');
          setClaudeWorkspaceTrusted(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentCommand, cwd, isReadOnlyTranscript, isRemoteExecution, startupProbeRetryNonce]);
  const outputBufferRef = useRef('');
  const currentOutputBlockRef = useRef('');
  const latestCompletedOutputBlockRef = useRef('');
  const previousOutputBlockScopeKeyRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);
  const hasActivatedRef = useRef(false);
  const activatedRef = useRef(activated);
  const onActivatedRef = useRef(onActivated);
  const onActivatedWithFirstLineRef = useRef(onActivatedWithFirstLine);
  activatedRef.current = activated;
  onActivatedRef.current = onActivated;
  onActivatedWithFirstLineRef.current = onActivatedWithFirstLine;
  const hasAutoConfirmedTrustPromptRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Delay after Enter before arming idle monitor.
  const isWaitingForIdleRef = useRef(false); // Wait for idle notification; enabled after substantial output.
  const pendingIdleMonitorRef = useRef(false); // Pending idle monitor; enabled after Enter.
  const dataSinceEnterRef = useRef(0); // Track output volume since last Enter.
  const currentTitleRef = useRef<string>(''); // Terminal title from OSC escape sequence.
  const runtimeStateRef = useRef<'live' | 'reconnecting' | 'dead'>('live');
  const trustPromptSubmitRef = useRef<(data: string) => void>(() => {});
  const terminalFocusRef = useRef<(() => void) | null>(null);
  const initialBackendSessionIdRef = useRef(backendSessionId);

  // Output state tracking for global store
  const outputStateRef = useRef<OutputState>('idle');
  const isMonitoringOutputRef = useRef(false); // Only monitor after user presses Enter
  const outputSinceEnterRef = useRef(0); // Track output volume since Enter for indicator
  const lastOutputTimeRef = useRef(0); // Track last output timestamp for idle detection
  const activityPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveIdleCountRef = useRef(0); // Count consecutive idle polls
  const ptyIdRef = useRef<string | null>(null); // Store PTY ID for activity checks
  const isActiveRef = useRef(isActive); // Track latest isActive value for interval callback
  const lastCommandWasSlashCommand = useRef(false); // Track if last command was a slash command
  const pendingTerminalAttachmentInsertRef = useRef<AgentAttachmentItem[]>([]);
  const interruptIdleResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInterruptRequestAtRef = useRef<number | null>(null);
  const setOutputState = useAgentSessionsStore((s) => s.setOutputState);
  const markSessionActive = useAgentSessionsStore((s) => s.markSessionActive);
  const clearRuntimeState = useAgentSessionsStore((s) => s.clearRuntimeState);
  const getEnhancedInputState = useAgentSessionsStore((s) => s.getEnhancedInputState);
  const setEnhancedInputAttachments = useAgentSessionsStore((s) => s.setEnhancedInputAttachments);

  const terminalSessionId = id ?? sessionId;
  const [shouldBypassHostSessionRecovery, setShouldBypassHostSessionRecovery] = useState(
    recoveryState === 'missing-host-session'
  );

  useEffect(() => {
    const nextRecoveryIdentity = `${terminalSessionId ?? ''}:${hostSessionKey ?? ''}`;
    if (!nextRecoveryIdentity && recoveryState !== 'missing-host-session') {
      setShouldBypassHostSessionRecovery(false);
      return;
    }
    setShouldBypassHostSessionRecovery(recoveryState === 'missing-host-session');
  }, [hostSessionKey, recoveryState, terminalSessionId]);
  const shouldValidateResolvedProviderSession =
    agentCommand === 'codex' &&
    recoveryState === 'missing-host-session' &&
    hasResolvedProviderSessionId(id, sessionId);
  const inputDispatchSessionId = backendSessionId ?? null;
  const agentCapabilityPolicies = useMemo(() => {
    const directProjectPolicy = repoPath ? getClaudeProjectPolicy(repoPath) : null;
    const directWorktreePolicy = cwd ? getClaudeWorktreePolicy(cwd) : null;
    const schemeLaunchState =
      repoPath && cwd
        ? resolveProjectConfigSchemeLaunchState({
            repoPath,
            worktreePath: cwd,
            schemes: projectConfigSchemes,
            promptPresets,
            repositorySelection: getProjectConfigSchemeSelection(repoPath),
            worktreeSelection: getWorktreeConfigSchemeSelection(cwd, repoPath),
            directProjectPolicy,
            directWorktreePolicy,
            existingInitialPrompt: initialPrompt,
            applySchemePrompt: !initialized,
          })
        : {
            projectPolicy: directProjectPolicy,
            worktreePolicy: directWorktreePolicy,
            initialPrompt: initialPrompt ?? null,
          };

    return {
      globalPolicy: getClaudeGlobalPolicy(),
      projectPolicy: schemeLaunchState.projectPolicy,
      worktreePolicy: schemeLaunchState.worktreePolicy,
      initialPrompt: schemeLaunchState.initialPrompt,
    };
  }, [cwd, initialPrompt, initialized, projectConfigSchemes, promptPresets, repoPath]);
  const effectiveInitialPrompt = agentCapabilityPolicies.initialPrompt ?? undefined;
  const supportsNativeTerminalInput = supportsAgentNativeTerminalInput(agentId);

  const clearInterruptIdleResetTimer = useCallback(() => {
    if (interruptIdleResetTimerRef.current) {
      clearTimeout(interruptIdleResetTimerRef.current);
      interruptIdleResetTimerRef.current = null;
    }
  }, []);

  const { providerSessionResolutionPending, resolvedProviderSessionId } =
    useAgentProviderSessionDiscovery({
      agentCommand: isReadOnlyTranscript ? '' : agentCommand,
      uiSessionId: id,
      providerSessionId: sessionId,
      cwd,
      createdAt,
      initialized: isReadOnlyTranscript ? false : initialized,
      isRemoteExecution,
      allowRecoveryBeforeInitialization: recovered && persistenceEnabled,
      validateResolvedProviderSession: shouldValidateResolvedProviderSession,
      onProviderSessionIdChange,
    });
  const lastSessionActivityAt = useAgentSessionsStore(
    (state) => state.runtimeStates[terminalSessionId ?? '']?.lastActivityAt
  );
  useAgentProviderSessionTitle({
    agentCommand: isReadOnlyTranscript ? '' : agentCommand,
    uiSessionId: id,
    providerSessionId: sessionId,
    titleSource,
    isRemoteExecution,
    activitySignal: lastSessionActivityAt,
    onProviderSessionTitle,
  });
  const resumeSessionId = providerSessionResolutionPending
    ? id
    : resolvedProviderSessionId === null
      ? id
      : (resolvedProviderSessionId ?? sessionId ?? id);
  const shouldHoldAgentSessionStartup =
    !isReadOnlyTranscript &&
    agentCommand === 'codex' &&
    recoveryState === 'missing-host-session' &&
    providerSessionResolutionPending;
  const effectiveBackendSessionId = shouldHoldAgentSessionStartup ? undefined : backendSessionId;

  useEffect(() => {
    if (providerSessionResolutionPending || !onProviderSessionIdentityValidityChange) {
      return;
    }

    if (resolvedProviderSessionId === null) {
      onProviderSessionIdentityValidityChange(false);
      return;
    }

    if (resolvedProviderSessionId) {
      onProviderSessionIdentityValidityChange(true);
    }
  }, [
    onProviderSessionIdentityValidityChange,
    providerSessionResolutionPending,
    resolvedProviderSessionId,
  ]);

  // Use external control if provided, otherwise use local state.
  // IMPORTANT: `externalEnhancedInputOpen` can be false, so we must check `undefined` rather than truthiness.
  const [localEnhancedInputOpen, setLocalEnhancedInputOpen] = useState(false);
  const isExternallyControlled = externalEnhancedInputOpen !== undefined;
  const enhancedInputOpen = isExternallyControlled
    ? externalEnhancedInputOpen
    : localEnhancedInputOpen;
  const waitingForInput = useAgentSessionsStore(
    (state) => state.runtimeStates[terminalSessionId ?? '']?.waitingForInput ?? false
  );
  const setEnhancedInputOpen = useCallback(
    (open: boolean) => {
      if (isExternallyControlled) {
        onEnhancedInputOpenChange?.(open);
        return;
      }
      setLocalEnhancedInputOpen(open);
    },
    [isExternallyControlled, onEnhancedInputOpenChange]
  );

  const appendDraftAttachments = useCallback(
    (nextAttachments: AgentAttachmentItem[]) => {
      if (!terminalSessionId || nextAttachments.length === 0) {
        return;
      }
      const currentDraftAttachments = getEnhancedInputState(terminalSessionId).attachments;
      setEnhancedInputAttachments(
        terminalSessionId,
        mergeAgentAttachments(
          currentDraftAttachments,
          nextAttachments.map((attachment) => attachment.path)
        )
      );
      setEnhancedInputOpen(true);
    },
    [getEnhancedInputState, setEnhancedInputAttachments, setEnhancedInputOpen, terminalSessionId]
  );

  const showAttachmentPasteUnavailableWarning = useCallback(() => {
    const availability = resolveAgentInputAvailability({
      backendSessionId: inputDispatchSessionId,
      runtimeState: runtimeStateRef.current,
      uiSessionId: id,
      providerSessionId: sessionId,
    });
    const unavailableReason = resolveAgentInputUnavailableReason({
      agentCommand,
      availability,
      isRemoteExecution,
      t,
    });
    const description =
      outputStateRef.current === 'outputting'
        ? t('Wait for the agent to finish responding before pasting attachments.')
        : (unavailableReason ?? t('Wait for the agent prompt before pasting attachments.'));

    toastManager.add({
      type: 'warning',
      title: t('Attachment paste unavailable'),
      description,
    });
  }, [agentCommand, id, inputDispatchSessionId, isRemoteExecution, sessionId, t]);

  const dispatchTerminalAttachmentInsert = useCallback(
    (nextAttachments: AgentAttachmentItem[]) => {
      if (nextAttachments.length === 0 || !inputDispatchSessionId) {
        return false;
      }

      const text = buildAgentAttachmentInsertText(nextAttachments);
      if (!text) {
        return false;
      }

      void window.electronAPI.agentInput
        .dispatch({
          sessionId: inputDispatchSessionId,
          agentId,
          text,
          submit: false,
        })
        .catch((error) => {
          console.error('[AgentTerminal] Failed to insert agent attachment text', error);
          pendingTerminalAttachmentInsertRef.current = mergeAgentAttachments(
            pendingTerminalAttachmentInsertRef.current,
            nextAttachments.map((attachment) => attachment.path)
          );
        });
      terminalFocusRef.current?.();
      return true;
    },
    [agentId, inputDispatchSessionId]
  );

  const queueTerminalAttachmentInsert = useCallback((nextAttachments: AgentAttachmentItem[]) => {
    if (nextAttachments.length === 0) {
      return;
    }

    pendingTerminalAttachmentInsertRef.current = mergeAgentAttachments(
      pendingTerminalAttachmentInsertRef.current,
      nextAttachments.map((attachment) => attachment.path)
    );
  }, []);

  const flushQueuedTerminalAttachmentInsert = useCallback(() => {
    const queuedAttachments = pendingTerminalAttachmentInsertRef.current;
    if (queuedAttachments.length === 0) {
      return false;
    }

    const disposition = resolveAgentTerminalAttachmentInsertDisposition({
      sessionId: inputDispatchSessionId,
      attachmentCount: queuedAttachments.length,
      runtimeState: runtimeStateRef.current,
      outputState: outputStateRef.current,
      waitingForInput,
    });
    if (disposition !== 'insert') {
      return false;
    }

    pendingTerminalAttachmentInsertRef.current = [];
    return dispatchTerminalAttachmentInsert(queuedAttachments);
  }, [dispatchTerminalAttachmentInsert, inputDispatchSessionId, waitingForInput]);

  const insertTerminalAttachmentText = useCallback(
    (nextAttachments: AgentAttachmentItem[], source: AgentAttachmentSource = 'unknown') => {
      if (nextAttachments.length === 0) {
        return;
      }

      const disposition = resolveAgentTerminalAttachmentInsertDisposition({
        sessionId: inputDispatchSessionId,
        attachmentCount: nextAttachments.length,
        runtimeState: runtimeStateRef.current,
        outputState: outputStateRef.current,
        source,
        waitingForInput,
      });

      if (disposition === 'queue') {
        queueTerminalAttachmentInsert(nextAttachments);
        return;
      }

      if (disposition === 'reject') {
        showAttachmentPasteUnavailableWarning();
        return;
      }

      dispatchTerminalAttachmentInsert(nextAttachments);
    },
    [
      dispatchTerminalAttachmentInsert,
      inputDispatchSessionId,
      queueTerminalAttachmentInsert,
      showAttachmentPasteUnavailableWarning,
      waitingForInput,
    ]
  );

  const handleResolvedAttachmentTargets = useCallback(
    (nextDraftAttachments: AgentAttachmentItem[], source: AgentAttachmentSource = 'unknown') => {
      if (supportsNativeTerminalInput) {
        insertTerminalAttachmentText(nextDraftAttachments, source);
        return;
      }
      appendDraftAttachments(nextDraftAttachments);
    },
    [appendDraftAttachments, insertTerminalAttachmentText, supportsNativeTerminalInput]
  );

  const saveAttachmentToTemp = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = getAttachmentTempExtension(file);
        const filename = `${TEMP_INPUT_FILE_PREFIX}-${timestamp}-${random}.${extension}`;
        const result = await window.electronAPI.file.saveToTemp(filename, buffer);

        if (result.success && result.path) {
          return result.path;
        }

        const errorMessage = result.error || undefined;
        const errorCopy = file.type.startsWith('image/')
          ? buildChatInputToastCopy(
              {
                action: 'image-save',
                phase: 'error',
                message: errorMessage,
              },
              t
            )
          : buildFileWorkflowToastCopy(
              {
                action: 'file-save',
                phase: 'error',
                message: errorMessage,
              },
              t
            );
        toastManager.add({
          type: 'error',
          title: errorCopy.title,
          description: errorCopy.description,
        });
        return null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorCopy = file.type.startsWith('image/')
          ? buildChatInputToastCopy({ action: 'image-save', phase: 'error', message }, t)
          : buildFileWorkflowToastCopy({ action: 'file-save', phase: 'error', message }, t);
        toastManager.add({
          type: 'error',
          title: errorCopy.title,
          description: errorCopy.description,
        });
        return null;
      }
    },
    [t]
  );

  const saveClipboardImageToTemp = useCallback(async (file: File): Promise<string | null> => {
    if (!file.type.toLowerCase().startsWith('image/')) {
      return null;
    }

    try {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const format = resolveClipboardImageTempFormat(file);
      const extension = format === 'jpeg' ? 'jpg' : 'png';
      const filename = `${TEMP_INPUT_FILE_PREFIX}-${timestamp}-${random}.${extension}`;
      const result = await window.electronAPI.file.saveClipboardImageToTemp({
        filename,
        format,
      });

      if (result.success && result.path) {
        return result.path;
      }

      return null;
    } catch {
      return null;
    }
  }, []);

  const pasteClipboardImageAttachment = useCallback(async () => {
    try {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const filename = `${TEMP_INPUT_FILE_PREFIX}-${timestamp}-${random}.png`;
      const result = await window.electronAPI.file.saveClipboardImageToTemp({
        filename,
        format: 'png',
      });

      if (result.success && result.path) {
        handleResolvedAttachmentTargets(mergeAgentAttachments([], [result.path]), 'clipboard');
        return;
      }

      const errorCopy = buildChatInputToastCopy(
        {
          action: 'image-save',
          phase: 'error',
          message: result.error || undefined,
        },
        t
      );
      toastManager.add({
        type: 'error',
        title: errorCopy.title,
        description: errorCopy.description,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorCopy = buildChatInputToastCopy(
        { action: 'image-save', phase: 'error', message },
        t
      );
      toastManager.add({
        type: 'error',
        title: errorCopy.title,
        description: errorCopy.description,
      });
    }
  }, [handleResolvedAttachmentTargets, t]);

  const showOversizedAttachmentWarning = useCallback(
    (oversizedFiles: File[]) => {
      const largestSizeBytes = Math.max(...oversizedFiles.map((file) => file.size), 0);
      const largestSizeMb = Math.ceil(largestSizeBytes / (1024 * 1024));
      const attachmentLabel =
        oversizedFiles.length === 1 ? oversizedFiles[0]?.name || t('Attachment') : t('Attachments');

      toastManager.add({
        type: 'warning',
        title: t('Attachment too large'),
        description: t(
          '{{label}} must be smaller than {{limit}} MB to paste into the agent input. Largest pasted file: {{size}} MB.',
          {
            label: attachmentLabel,
            limit: Math.floor(DRAFT_ATTACHMENT_MAX_BYTES / (1024 * 1024)),
            size: largestSizeMb,
          }
        ),
      });
    },
    [t]
  );

  const resolveAttachmentTargets = useCallback(
    async (files: File[], source: AgentAttachmentSource = 'unknown') => {
      if (files.length === 0) {
        return;
      }

      const oversizedFiles = files.filter((file) => file.size > DRAFT_ATTACHMENT_MAX_BYTES);
      if (oversizedFiles.length > 0) {
        showOversizedAttachmentWarning(oversizedFiles);
        return;
      }

      const targets = await resolveAgentAttachmentTargetsFromFiles(files, {
        source,
        resolveFilePath: (file) => {
          try {
            return window.electronAPI.utils.getPathForFile(file) || null;
          } catch {
            return null;
          }
        },
        saveClipboardImageToTemp,
        saveFileToTemp: saveAttachmentToTemp,
      });
      handleResolvedAttachmentTargets(targets.draftAttachments, source);
    },
    [
      handleResolvedAttachmentTargets,
      saveClipboardImageToTemp,
      saveAttachmentToTemp,
      showOversizedAttachmentWarning,
    ]
  );

  const handleClipboardAttachmentPaste = useCallback(
    (event: ClipboardEvent): boolean => {
      if (event.defaultPrevented) {
        return false;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return false;
      }

      const files = collectAgentTerminalClipboardFiles(clipboardData);
      if (files.length > 0) {
        if (!shouldCaptureAgentTerminalClipboardFiles(agentId, files)) {
          return false;
        }

        event.preventDefault();
        void resolveAttachmentTargets(files, 'clipboard');
        return true;
      }

      if (!hasAgentTerminalClipboardImageSignal(clipboardData)) {
        return false;
      }

      event.preventDefault();
      void pasteClipboardImageAttachment();
      return true;
    },
    [agentId, pasteClipboardImageAttachment, resolveAttachmentTargets]
  );

  // Keep isActiveRef in sync with isActive prop
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Helper to update output state (with ref tracking to avoid unnecessary store updates)
  const updateOutputState = useCallback(
    (newState: OutputState) => {
      if (!terminalSessionId) return;
      if (newState !== 'outputting') {
        lastInterruptRequestAtRef.current = null;
        clearInterruptIdleResetTimer();
      }
      if (outputStateRef.current === newState) return;
      outputStateRef.current = newState;
      // Use isActiveRef.current to get latest value (important for interval callbacks)
      setOutputState(terminalSessionId, newState, isActiveRef.current);

      // Hide enhanced input when agent starts running (hideWhileRunning mode)
      if (
        newState === 'outputting' &&
        agentId === 'claude' &&
        !supportsNativeTerminalInput &&
        agentIntegration.enhancedInputEnabled &&
        agentIntegration.enhancedInputAutoPopup === 'hideWhileRunning'
      ) {
        onEnhancedInputOpenChange?.(false);
      }

      if (newState !== 'outputting') {
        flushQueuedTerminalAttachmentInsert();
      }
    },
    [
      clearInterruptIdleResetTimer,
      terminalSessionId,
      setOutputState,
      agentId,
      supportsNativeTerminalInput,
      agentIntegration,
      flushQueuedTerminalAttachmentInsert,
      onEnhancedInputOpenChange,
    ]
  );

  const scheduleInterruptOutputStateReset = useCallback(() => {
    clearInterruptIdleResetTimer();
    interruptIdleResetTimerRef.current = setTimeout(() => {
      interruptIdleResetTimerRef.current = null;

      if (
        shouldForceAgentTerminalIdleAfterInterrupt({
          now: Date.now(),
          outputState: outputStateRef.current,
          runtimeState: runtimeStateRef.current,
          lastInterruptRequestAt: lastInterruptRequestAtRef.current,
          lastOutputAt: lastOutputTimeRef.current,
        })
      ) {
        updateOutputState('idle');
      }
    }, INTERRUPT_OUTPUT_IDLE_SETTLE_MS);
  }, [clearInterruptIdleResetTimer, updateOutputState]);

  const getLatestCopyableOutputBlock = useCallback(() => {
    return (
      resolveCopyableAgentOutputBlock(currentOutputBlockRef.current) ??
      resolveCopyableAgentOutputBlock(latestCompletedOutputBlockRef.current)
    );
  }, []);

  const isAgentStartupReady = useMemo(() => {
    if (isReadOnlyTranscript) {
      return true;
    }

    if (shouldHoldAgentSessionStartup) {
      return false;
    }
    if (agentCommand.startsWith('claude') && agentIntegration.enabled && claudeIdeStatus === null) {
      return false;
    }
    if (
      agentCommand.startsWith('claude') &&
      !isRemoteExecution &&
      claudeWorkspaceTrusted === null
    ) {
      return false;
    }
    if (!isRemoteExecution && !resolvedShell) {
      return false;
    }
    if (environment === 'hapi' && hapiGlobalInstalled === null) {
      return false;
    }
    return true;
  }, [
    environment,
    hapiGlobalInstalled,
    isReadOnlyTranscript,
    shouldHoldAgentSessionStartup,
    agentCommand,
    agentIntegration.enabled,
    claudeIdeStatus,
    claudeWorkspaceTrusted,
    isRemoteExecution,
    resolvedShell,
  ]);
  const effectiveIsActive = isAgentStartupReady ? isActive : false;
  const effectiveIsVisible = isReadOnlyTranscript ? isVisible : isVisible && isAgentStartupReady;

  // Mark session as active when user is viewing it
  useEffect(() => {
    if (isActive && terminalSessionId) {
      markSessionActive(terminalSessionId);
    }
  }, [isActive, terminalSessionId, markSessionActive]);

  const activityPollIntervalMs = resolveAgentTerminalActivityPollIntervalMs({
    isActive: effectiveIsActive,
  });
  const activateOnInitialCommandWhenInactive = hasPendingCommand || !recovered;
  const isTerminalStartupVisible = isActive || isVisible || hasPendingCommand;

  // Start polling for process activity
  const startActivityPolling = useCallback(() => {
    // Clear any existing interval
    if (activityPollIntervalRef.current) {
      clearInterval(activityPollIntervalRef.current);
    }
    consecutiveIdleCountRef.current = 0;

    activityPollIntervalRef.current = setInterval(async () => {
      if (!ptyIdRef.current || !isMonitoringOutputRef.current) {
        // Stop polling if no PTY or not monitoring
        if (activityPollIntervalRef.current) {
          clearInterval(activityPollIntervalRef.current);
          activityPollIntervalRef.current = null;
        }
        return;
      }

      try {
        const hasProcessActivity = await window.electronAPI.session.getActivity(ptyIdRef.current);
        const now = Date.now();
        const hasRecentOutput = now - lastOutputTimeRef.current < RECENT_OUTPUT_TIMEOUT_MS;

        if (hasProcessActivity || hasRecentOutput) {
          // Process is active OR has recent output, reset idle counter
          consecutiveIdleCountRef.current = 0;
          // If we have enough output, show the indicator
          if (outputSinceEnterRef.current > MIN_OUTPUT_FOR_INDICATOR) {
            updateOutputState('outputting');
            // Activity state is now managed by Hook notifications only
          }
        } else {
          // Process is idle AND no recent output
          consecutiveIdleCountRef.current++;
          // Only mark as idle after several consecutive idle polls
          if (consecutiveIdleCountRef.current >= IDLE_CONFIRMATION_COUNT) {
            updateOutputState('idle');
            isMonitoringOutputRef.current = false;

            // Activity state is now managed by Hook notifications only

            // Stop polling when confirmed idle
            if (activityPollIntervalRef.current) {
              clearInterval(activityPollIntervalRef.current);
              activityPollIntervalRef.current = null;
            }
          }
        }
      } catch {
        // Error checking activity, ignore
      }
    }, activityPollIntervalMs);
  }, [activityPollIntervalMs, updateOutputState]);

  // Stop polling for process activity
  const stopActivityPolling = useCallback(() => {
    if (activityPollIntervalRef.current) {
      clearInterval(activityPollIntervalRef.current);
      activityPollIntervalRef.current = null;
    }
  }, []);

  // Cleanup runtime state on unmount
  useEffect(() => {
    return () => {
      if (terminalSessionId) {
        clearRuntimeState(terminalSessionId);
      }
      clearInterruptIdleResetTimer();
      stopActivityPolling();
    };
  }, [terminalSessionId, clearInterruptIdleResetTimer, clearRuntimeState, stopActivityPolling]);

  useEffect(() => {
    if (!isMonitoringOutputRef.current || !activityPollIntervalRef.current) {
      return;
    }

    startActivityPolling();
  }, [startActivityPolling]);

  // Build command with session args
  const handleSessionCreateFallbackRetry = useCallback(() => {
    setShouldBypassHostSessionRecovery(true);
  }, []);
  const [isTmuxHostScrollbackActive, setIsTmuxHostScrollbackActive] = useState(false);
  const [isMouseSelectingTerminal, setIsMouseSelectingTerminal] = useState(false);
  const mouseSelectionAutoScrollPositionRef = useRef<MouseSelectionPosition | null>(null);
  const stopMouseSelectionAutoScrollRef = useRef<(() => void) | null>(null);

  const { command, env, initialCommand, hostSession, sessionCreateFallback } = useMemo(
    () =>
      resolveAgentTerminalLaunchPlan({
        isReadOnlyTranscript,
        recoveryState,
        shouldBypassHostSessionRecovery,
        onHostlessRetry: handleSessionCreateFallbackRetry,
        agentCommand,
        customPath,
        customArgs,
        initialPrompt: effectiveInitialPrompt,
        resumeSessionId,
        initialized,
        environment,
        hapiGlobalInstalled,
        hapiCliApiToken: hapiSettings.cliApiToken,
        isRemoteExecution,
        executionPlatform,
        enableIdeIntegration: claudeIdeStatus?.canUseIde ?? false,
        tmuxEnabled: agentIntegration.tmuxEnabled,
        resolvedShell,
        terminalSessionId,
        runtimeChannel,
        persistentHostSessionKey: hostSessionKey,
      }),
    [
      agentCommand,
      claudeIdeStatus?.canUseIde,
      customPath,
      customArgs,
      effectiveInitialPrompt,
      resumeSessionId,
      initialized,
      isReadOnlyTranscript,
      environment,
      hapiSettings.cliApiToken,
      hapiGlobalInstalled,
      isRemoteExecution,
      executionPlatform,
      agentIntegration.tmuxEnabled,
      resolvedShell,
      terminalSessionId,
      runtimeChannel,
      hostSessionKey,
      recoveryState,
      shouldBypassHostSessionRecovery,
      handleSessionCreateFallbackRetry,
    ]
  );

  // Preserve exited sessions in the UI so users can inspect the final output and state.
  const handleExit = useCallback(() => {
    const stopSessionId = sessionId || id;
    if (stopSessionId) {
      emitRendererAgentStop({
        sessionId: stopSessionId,
        cwd,
        source: 'renderer-terminal',
        taskCompletionStatus: currentOutputBlockRef.current.includes(TASK_COMPLETION_MARKER)
          ? 'completed'
          : 'unknown',
      });
    }
    onExit?.();
  }, [cwd, id, onExit, sessionId]);

  // Track output for error detection and idle notification
  const handleData = useCallback(
    (data: string) => {
      // Start timer on first data
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      // Mark as initialized on first data
      if (!hasInitializedRef.current && !initialized) {
        hasInitializedRef.current = true;
        onInitialized?.();
      }

      // Buffer output for error detection
      outputBufferRef.current += data;
      if (outputBufferRef.current.length > 1000) {
        outputBufferRef.current = outputBufferRef.current.slice(-500);
      }
      currentOutputBlockRef.current = appendRecentAgentOutput(currentOutputBlockRef.current, data);
      if (
        !hasRenderableTerminalOutput &&
        hasRenderableAgentTerminalOutput(currentOutputBlockRef.current)
      ) {
        setHasRenderableTerminalOutput(true);
      }

      if (
        claudeWorkspaceTrusted === true &&
        agentCommand.startsWith('claude') &&
        !hasAutoConfirmedTrustPromptRef.current &&
        isClaudeWorkspaceTrustPrompt(outputBufferRef.current)
      ) {
        hasAutoConfirmedTrustPromptRef.current = true;
        trustPromptSubmitRef.current('\r');
      }

      // Track output volume since last Enter
      dataSinceEnterRef.current += data.length;

      // === Output state tracking for UI indicator ===
      // Only track when we're monitoring (after user pressed Enter)
      if (isMonitoringOutputRef.current) {
        outputSinceEnterRef.current += data.length;
        lastOutputTimeRef.current = Date.now(); // Track last output time for idle detection
        if (lastInterruptRequestAtRef.current !== null) {
          scheduleInterruptOutputStateReset();
        }

        // Update to 'outputting' once we have substantial output after Enter
        if (outputSinceEnterRef.current > MIN_OUTPUT_FOR_INDICATOR) {
          updateOutputState('outputting');
          // Note: Activity state 'running' is set by handleCustomKey (on Enter) and
          // startActivityPolling (during polling), so no need to set it here
        }
        // Note: The transition to 'idle' is handled by process activity polling
        // (startActivityPolling), not by a simple timeout
      }

      // Only arm idle monitoring after receiving substantial output
      // This prevents notifications from simple prompt echoes
      if (
        pendingIdleMonitorRef.current &&
        dataSinceEnterRef.current > MIN_OUTPUT_FOR_NOTIFICATION
      ) {
        isWaitingForIdleRef.current = true;
        pendingIdleMonitorRef.current = false;
      }

      const stopHookEnabledForSession =
        agentIntegration.stopHookEnabled && agentCommand.startsWith('claude');

      if (!agentNotificationEnabled || !isWaitingForIdleRef.current || stopHookEnabledForSession)
        return;

      // Clear existing idle timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      // Set new idle timer - notify when agent stops outputting
      idleTimerRef.current = setTimeout(() => {
        if (isWaitingForIdleRef.current) {
          // Stop waiting after sending the notification, wait for next Enter.
          isWaitingForIdleRef.current = false;
          // Use terminal title as body, fall back to project name.
          const projectName = cwd?.split('/').pop() || 'Unknown';
          const notificationBody = currentTitleRef.current || projectName;
          if (!terminalSessionId) return;
          const notificationCopy = buildChatNotificationCopy(
            {
              action: 'command-output-ready',
              command: agentCommand,
              body: notificationBody,
            },
            t
          );
          void showRendererNotification({
            title: notificationCopy.title,
            body: notificationCopy.body,
            sessionId: terminalSessionId,
          });
        }
      }, agentNotificationDelay * 1000);
    },
    [
      initialized,
      onInitialized,
      claudeWorkspaceTrusted,
      agentCommand,
      cwd,
      agentNotificationEnabled,
      agentNotificationDelay,
      agentIntegration.stopHookEnabled,
      hasRenderableTerminalOutput,
      scheduleInterruptOutputStateReset,
      terminalSessionId,
      t,
      updateOutputState,
    ]
  );

  // Handle terminal title changes (OSC escape sequences)
  const handleTitleChange = useCallback((title: string) => {
    currentTitleRef.current = title;
  }, []);

  // Handle Shift+Enter for newline (Ctrl+J / LF for all agents)
  const activateSessionFromInput = useCallback((input?: string | null) => {
    if (hasActivatedRef.current || activatedRef.current) {
      return;
    }

    hasActivatedRef.current = true;
    onActivatedRef.current?.();

    const firstLine = getFirstMeaningfulInputLine(input);
    if (firstLine) {
      onActivatedWithFirstLineRef.current?.(firstLine);
    }
  }, []);

  // Also detect Enter key press to mark session as activated
  // biome-ignore lint/correctness/useExhaustiveDependencies: terminal is accessed via try-catch for safety and defined after this callback
  const handleCustomKey = useCallback(
    (event: KeyboardEvent, ptyId: string) => {
      if (isNativeImeCompositionKeyEvent(event)) {
        return true;
      }

      // Handle Shift+Enter for newline - must be before keydown check to block both keydown and keypress
      if (event.key === 'Enter' && event.shiftKey) {
        if (event.type === 'keydown' && runtimeStateRef.current === 'live') {
          window.electronAPI.session.write(ptyId, '\x0a');
        }
        return false;
      }

      // Only handle keydown events for other logic
      if (event.type !== 'keydown') return true;

      // Handle Ctrl+G to toggle enhanced input (only for Claude)
      if (
        event.ctrlKey &&
        event.code === 'KeyG' &&
        agentId === 'claude' &&
        !supportsNativeTerminalInput
      ) {
        if (agentIntegration.enhancedInputEnabled) {
          setEnhancedInputOpen(!enhancedInputOpen);
          return false; // Block the key event only when enhanced input is enabled
        }
        // When enhanced input is disabled, let the event pass through to terminal
      }

      // Detect Enter key press (without modifiers) to activate session and start idle monitoring
      // Skip if IME is composing (e.g. selecting Chinese characters)
      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
        const completedOutputBlock = resolveCopyableAgentOutputBlock(currentOutputBlockRef.current);
        if (completedOutputBlock) {
          latestCompletedOutputBlockRef.current = currentOutputBlockRef.current;
        }
        currentOutputBlockRef.current = '';

        // Terminal buffer content can be agent output, such as an interactive menu option.
        // Only explicit enhanced input is allowed to supply an automatic session title.
        activateSessionFromInput();
        // Reset output counter.
        dataSinceEnterRef.current = 0;
        lastInterruptRequestAtRef.current = null;
        clearInterruptIdleResetTimer();

        // Detect if user entered a slash command (like /clear, /help, etc.)
        // These commands don't trigger Claude and should quickly return to idle
        let isSlashCommand = false;
        if (terminal) {
          try {
            const cursorY = terminal.buffer.active.cursorY;
            const line = terminal.buffer.active.getLine(cursorY);
            if (line) {
              const lineText = line.translateToString().trim();
              isSlashCommand = lineText.startsWith('/');
              lastCommandWasSlashCommand.current = isSlashCommand;
              // Note: slash command detection enables 2s idle timeout for quick return to idle
              if (isSlashCommand) {
                console.log(`[AgentTerminal] Slash command: ${lineText.split(' ')[0]}`);
              }
            }
          } catch {
            // Ignore errors reading terminal buffer
          }
        }

        // Activity state is now managed by Hook notifications (PreToolUse, Stop, AskUserQuestion)
        // Enter event no longer sets activity state to avoid conflicts with other terminals

        if (terminalSessionId) {
          isMonitoringOutputRef.current = true;
          outputSinceEnterRef.current = 0;
          ptyIdRef.current = ptyId;
          startActivityPolling();
        }

        // Clear any existing enter delay timer.
        if (enterDelayTimerRef.current) {
          clearTimeout(enterDelayTimerRef.current);
          enterDelayTimerRef.current = null;
        }
        // If enter delay is configured, wait before arming idle monitor.
        if (agentNotificationEnterDelay > 0) {
          enterDelayTimerRef.current = setTimeout(() => {
            pendingIdleMonitorRef.current = true;
            enterDelayTimerRef.current = null;
          }, agentNotificationEnterDelay * 1000);
        } else {
          // No delay - arm idle monitor immediately.
          pendingIdleMonitorRef.current = true;
        }
        return true; // Let Enter through normally
      }

      if (
        isAgentTerminalInterruptKeyEvent({
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
        }) &&
        outputStateRef.current === 'outputting'
      ) {
        lastInterruptRequestAtRef.current = Date.now();
        scheduleInterruptOutputStateReset();
      }

      // User is typing - cancel idle notification and enter delay timer
      if (
        (isWaitingForIdleRef.current ||
          pendingIdleMonitorRef.current ||
          enterDelayTimerRef.current) &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        isWaitingForIdleRef.current = false;
        pendingIdleMonitorRef.current = false;
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        if (enterDelayTimerRef.current) {
          clearTimeout(enterDelayTimerRef.current);
          enterDelayTimerRef.current = null;
        }
      }

      return true;
    },
    [
      activateSessionFromInput,
      agentNotificationEnterDelay,
      clearInterruptIdleResetTimer,
      startActivityPolling,
      terminalSessionId,
      agentId,
      supportsNativeTerminalInput,
      agentIntegration.enhancedInputEnabled,
      enhancedInputOpen,
      setEnhancedInputOpen,
      scheduleInterruptOutputStateReset,
      // Note: terminal is excluded as it's defined after this callback
      // and accessed via try-catch for safety
    ]
  );

  const agentLaunchMetadata = useMemo(
    () =>
      isReadOnlyTranscript
        ? undefined
        : buildAgentCapabilityLaunchMetadata({
            agentId,
            agentCommand,
            repoPath,
            worktreePath: cwd,
            globalPolicy: agentCapabilityPolicies.globalPolicy,
            projectPolicy: agentCapabilityPolicies.projectPolicy,
            worktreePolicy: agentCapabilityPolicies.worktreePolicy,
            sessionPolicy,
            materializationMode,
            metadata:
              persistenceEnabled && terminalSessionId
                ? {
                    uiSessionId: terminalSessionId,
                    agentId,
                    agentCommand,
                    environment,
                  }
                : undefined,
          }),
    [
      agentCapabilityPolicies.globalPolicy,
      agentCapabilityPolicies.projectPolicy,
      agentCapabilityPolicies.worktreePolicy,
      agentCommand,
      agentId,
      cwd,
      environment,
      isReadOnlyTranscript,
      materializationMode,
      persistenceEnabled,
      repoPath,
      sessionPolicy,
      terminalSessionId,
    ]
  );

  const {
    containerRef,
    isLoading,
    runtimeState,
    settings,
    findNext,
    findPrevious,
    searchState,
    clearSearch,
    fit: fitTerminalLayout,
    terminal,
    clear,
    refreshRenderer,
    recreateWebglRenderer,
    restartSession,
    write,
  } = useXterm({
    cwd,
    backendSessionId: effectiveBackendSessionId,
    command,
    env,
    hostSession,
    initialCommand,
    activateOnInitialCommandWhenInactive,
    isActive: effectiveIsActive,
    isVisible: effectiveIsVisible,
    kind: 'agent',
    fontSizeScale: terminalFontScale,
    preferCompatibilityRenderer,
    sessionCreateFallback,
    staticContent: transcriptStaticContent,
    metadata: agentLaunchMetadata,
    persistOnDisconnect: shouldPersistAgentSessionOnDisconnect(persistenceEnabled),
    preferHostScrollback:
      hostSession?.kind === 'tmux' &&
      (recovered || (persistenceEnabled && Boolean(initialBackendSessionIdRef.current))),
    retryOnDeadSession: shouldRetryDeadAgentSession({
      persistenceEnabled,
      recovered,
      recoveryState,
      hostSessionKey,
    }),
    recoveredReplaySnapshot: replaySnapshot,
    onExit: handleExit,
    onData: handleData,
    onReplaySnapshotChange,
    onCustomKey: handleCustomKey,
    onTitleChange: handleTitleChange,
    onSessionIdChange: onBackendSessionIdChange,
    onHostScrollbackStateChange: setIsTmuxHostScrollbackActive,
    onSessionOpen: (session) => {
      const capabilityState = extractAgentCapabilitySessionMetadata(session.metadata);
      if (capabilityState) {
        onClaudePolicyStateChange?.(capabilityState);
      }
      const policyState = extractClaudePolicySessionMetadata(session.metadata);
      if (policyState) {
        onClaudePolicyStateChange?.(policyState);
      }
    },
    onSplit,
    onMerge,
    canMerge,
  });
  const shouldUseMouseSelectionHostScrollback =
    hostSession?.kind === 'tmux' &&
    (recovered || (persistenceEnabled && Boolean(initialBackendSessionIdRef.current)));
  trustPromptSubmitRef.current = write;
  terminalFocusRef.current = () => focusXtermTextInput(terminal);
  runtimeStateRef.current = runtimeState;
  const lastAppliedLayoutRefreshRef = useRef<{
    key: string;
    terminal: NonNullable<typeof terminal>;
    terminalFontScale: number | undefined;
  } | null>(null);
  useEffect(() => {
    if (runtimeState === 'live') {
      return;
    }

    lastInterruptRequestAtRef.current = null;
    clearInterruptIdleResetTimer();
  }, [clearInterruptIdleResetTimer, runtimeState]);

  useEffect(() => {
    onRuntimeStateChange?.(runtimeState);
  }, [onRuntimeStateChange, runtimeState]);

  useEffect(() => {
    if (!layoutRefreshKey || !terminal) {
      lastAppliedLayoutRefreshRef.current = null;
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const lastApplied = lastAppliedLayoutRefreshRef.current;
    if (
      lastApplied?.key === layoutRefreshKey &&
      lastApplied.terminal === terminal &&
      lastApplied.terminalFontScale === terminalFontScale
    ) {
      return;
    }
    lastAppliedLayoutRefreshRef.current = {
      key: layoutRefreshKey,
      terminal,
      terminalFontScale,
    };

    let frameId: number | null = null;
    const containerReadyCleanup = scheduleXtermContainerReady({
      container,
      onReady: () => {
        frameId = requestAnimationFrame(() => {
          frameId = null;
          fitTerminalLayout();
          refreshRenderer();
          recreateWebglRenderer();
          if (effectiveIsActive) {
            focusXtermTextInput(terminal);
          }
        });
      },
      requestAnimationFrame: window.requestAnimationFrame.bind(window),
      cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    });

    return () => {
      containerReadyCleanup();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [
    containerRef,
    effectiveIsActive,
    fitTerminalLayout,
    layoutRefreshKey,
    recreateWebglRenderer,
    refreshRenderer,
    terminal,
    terminalFontScale,
  ]);

  const terminalOverlayState = isReadOnlyTranscript
    ? null
    : resolveTerminalRuntimeOverlayState({
        includeLocalRuntime: true,
        isLoading,
        isRemoteExecution,
        runtimeState,
      });
  const terminalOverlayPresentation = terminalOverlayState
    ? resolveAgentTerminalRuntimeOverlayPresentation({
        isRemoteExecution,
        state: terminalOverlayState,
      })
    : null;
  const isAgentStartupReadinessPending = !isReadOnlyTranscript && !isAgentStartupReady;
  const isAgentStartupActivationPending =
    !isReadOnlyTranscript && runtimeState === 'live' && terminal === null;
  const hasAgentStartupRenderableContent =
    isReadOnlyTranscript ||
    hasRenderableTerminalOutput ||
    hasRenderableAgentTerminalOutput(replaySnapshot ?? '');
  const isAgentStartupFirstOutputPending =
    !isReadOnlyTranscript && runtimeState === 'live' && !hasAgentStartupRenderableContent;
  const shouldShowAgentStartupOverlay =
    !isReadOnlyTranscript &&
    shouldShowAgentStartupOverlayForVisibility({
      createdAt,
      hasPendingCommand,
      hasRenderableContent: hasAgentStartupRenderableContent,
      isActive,
      isFirstOutputPending: isAgentStartupFirstOutputPending,
      isLoading,
      isReadinessPending: isAgentStartupReadinessPending,
      isTerminalActivationPending: isAgentStartupActivationPending,
      isVisible: isTerminalStartupVisible,
      lastActivityAt: lastSessionActivityAt,
      recoveryState,
    });
  const [isAgentStartupStalled, setIsAgentStartupStalled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchBarRef = useRef<TerminalSearchBarRef>(null);
  const agentStartupOverlayPresentation = useMemo(
    () => resolveAgentStartupOverlayPresentation({ isStalled: isAgentStartupStalled }),
    [isAgentStartupStalled]
  );
  const showAgentStartupRetryAction = shouldShowAgentStartupOverlay && isAgentStartupStalled;

  const handleRetryAgentStartup = useCallback(() => {
    setIsAgentStartupStalled(false);
    setStartupProbeRetryNonce((current) => current + 1);
    restartSession();
  }, [restartSession]);

  const previousRecoveryIdentityRef = useRef<{
    uiSessionId?: string;
    providerSessionId?: string;
    recoveryState?: PersistentAgentRuntimeState;
    backendSessionId?: string;
  }>({
    uiSessionId: id,
    providerSessionId: sessionId,
    recoveryState,
    backendSessionId,
  });

  useEffect(() => {
    const previous = previousRecoveryIdentityRef.current;
    const didResolveProviderSessionId =
      previous.recoveryState === 'missing-host-session' &&
      !previous.backendSessionId &&
      !hasResolvedProviderSessionId(previous.uiSessionId, previous.providerSessionId) &&
      recoveryState === 'missing-host-session' &&
      !backendSessionId &&
      hasResolvedProviderSessionId(id, sessionId) &&
      previous.providerSessionId !== sessionId;

    previousRecoveryIdentityRef.current = {
      uiSessionId: id,
      providerSessionId: sessionId,
      recoveryState,
      backendSessionId,
    };

    if (
      isReadOnlyTranscript ||
      !didResolveProviderSessionId ||
      !isTerminalStartupVisible ||
      !isAgentStartupReady
    ) {
      return;
    }

    restartSession();
  }, [
    backendSessionId,
    id,
    isReadOnlyTranscript,
    isAgentStartupReady,
    isTerminalStartupVisible,
    recoveryState,
    restartSession,
    sessionId,
  ]);

  useEffect(() => {
    if (!shouldShowAgentStartupOverlay) {
      setIsAgentStartupStalled(false);
      return;
    }

    setIsAgentStartupStalled(false);
    const stallTimer = window.setTimeout(() => {
      setIsAgentStartupStalled(true);
    }, AGENT_STARTUP_STALL_THRESHOLD_MS);

    return () => {
      window.clearTimeout(stallTimer);
    };
  }, [shouldShowAgentStartupOverlay]);

  // Mirror the side effects that used to live in EnhancedInput.onOpenChange:
  // - Treat opening EnhancedInput as active user interaction (reset idle timers)
  // - Restore terminal focus when EnhancedInput closes so Ctrl+G works without a click
  const prevEnhancedInputOpenRef = useRef(enhancedInputOpen);
  useEffect(() => {
    const prev = prevEnhancedInputOpenRef.current;
    if (prev === enhancedInputOpen) return;
    prevEnhancedInputOpenRef.current = enhancedInputOpen;

    if (enhancedInputOpen) {
      isWaitingForIdleRef.current = false;
      pendingIdleMonitorRef.current = false;

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      if (enterDelayTimerRef.current) {
        clearTimeout(enterDelayTimerRef.current);
        enterDelayTimerRef.current = null;
      }
      return;
    }

    requestAnimationFrame(() => focusXtermTextInput(terminal));
  }, [enhancedInputOpen, terminal]);
  const {
    showScrollToBottom: showLocalScrollToBottom,
    handleScrollToBottom: handleLocalScrollToBottom,
  } = useTerminalScrollToBottom(terminal);
  const tmuxHostScrollbackResetKey =
    hostSession?.kind === 'tmux'
      ? `${terminalSessionId ?? ''}\u0000${hostSession.serverName ?? ''}\u0000${hostSession.sessionName}`
      : `${terminalSessionId ?? ''}\u0000${hostSession?.kind ?? 'none'}`;

  useEffect(() => {
    if (!tmuxHostScrollbackResetKey) {
      return;
    }
    setIsTmuxHostScrollbackActive(false);
  }, [tmuxHostScrollbackResetKey]);
  const startMouseSelectionAutoScroll = useCallback(
    (event: MouseEvent) => {
      stopMouseSelectionAutoScrollRef.current?.();
      mouseSelectionAutoScrollPositionRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };

      const handleMouseSelectionMove = (event: MouseEvent) => {
        mouseSelectionAutoScrollPositionRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
      };
      const intervalId = window.setInterval(() => {
        const container = containerRef.current;
        const position = mouseSelectionAutoScrollPositionRef.current;
        if (!container || !position) {
          return;
        }

        const target = resolveMouseSelectionTarget(container);
        const lines = resolveMouseSelectionAutoScrollLines(target, position.clientY);
        if (lines !== 0) {
          if (cwd && shouldUseMouseSelectionHostScrollback && hostSession?.kind === 'tmux') {
            void window.electronAPI.tmux
              .scrollClient(cwd, {
                sessionName: hostSession.sessionName,
                serverName: hostSession.serverName,
                direction: lines < 0 ? 'up' : 'down',
                amount: Math.abs(lines),
              })
              .then((result) => {
                setIsTmuxHostScrollbackActive(Boolean(result.inMode));
              })
              .catch(() => {
                setIsTmuxHostScrollbackActive(false);
              });
          } else {
            terminal?.scrollLines(lines);
          }
          dispatchMouseSelectionMoveToXterm(target, position);
        }
      }, MOUSE_SELECTION_AUTO_SCROLL_INTERVAL_MS);

      const listenerDocument = containerRef.current?.ownerDocument ?? document;
      const listenerWindow = listenerDocument.defaultView ?? window;
      listenerWindow.addEventListener('mousemove', handleMouseSelectionMove, true);
      listenerDocument.addEventListener('mousemove', handleMouseSelectionMove, true);
      const stopMouseSelection = () => {
        window.clearInterval(intervalId);
        listenerWindow.removeEventListener('mousemove', handleMouseSelectionMove, true);
        listenerDocument.removeEventListener('mousemove', handleMouseSelectionMove, true);
        window.removeEventListener('mouseup', stopMouseSelection);
        window.removeEventListener('blur', stopMouseSelection);
        mouseSelectionAutoScrollPositionRef.current = null;
        stopMouseSelectionAutoScrollRef.current = null;
        setIsMouseSelectingTerminal(false);
      };
      window.addEventListener('mouseup', stopMouseSelection);
      window.addEventListener('blur', stopMouseSelection);
      stopMouseSelectionAutoScrollRef.current = stopMouseSelection;
      setIsMouseSelectingTerminal(true);
    },
    [containerRef, cwd, hostSession, shouldUseMouseSelectionHostScrollback, terminal]
  );

  useEffect(() => {
    return () => {
      stopMouseSelectionAutoScrollRef.current?.();
    };
  }, []);

  const handleTerminalMouseSelectionStart = useCallback(
    (event: MouseEvent) => {
      if (event.button !== 0 || isAgentTerminalFloatingControlTarget(event.target)) {
        return;
      }

      const container = containerRef.current;
      if (!(event.target instanceof Node) || !container?.contains(event.target)) {
        return;
      }

      startMouseSelectionAutoScroll(event);
    },
    [containerRef, startMouseSelectionAutoScroll]
  );

  const handleScrollToBottom = useCallback(() => {
    handleLocalScrollToBottom();

    if (!cwd || hostSession?.kind !== 'tmux' || !isTmuxHostScrollbackActive) {
      return;
    }

    void window.electronAPI.tmux
      .scrollClient(cwd, {
        sessionName: hostSession.sessionName,
        serverName: hostSession.serverName,
        direction: 'bottom',
      })
      .then((result) => {
        setIsTmuxHostScrollbackActive(Boolean(result.inMode));
      })
      .catch(() => {
        setIsTmuxHostScrollbackActive(false);
      });
  }, [cwd, handleLocalScrollToBottom, hostSession, isTmuxHostScrollbackActive]);
  const showScrollToBottom = showLocalScrollToBottom || isTmuxHostScrollbackActive;

  // Register write and focus functions to global store for external access
  const { register, unregister } = useTerminalWriteStore();
  useEffect(() => {
    if (!terminalSessionId || !write) return;

    register(terminalSessionId, write, () => focusXtermTextInput(terminal));
    return () => unregister(terminalSessionId);
  }, [terminalSessionId, write, terminal, register, unregister]);

  useEffect(() => {
    const nextOutputBlockScopeKey = backendSessionId ?? terminalSessionId ?? '';
    if (previousOutputBlockScopeKeyRef.current === nextOutputBlockScopeKey) {
      return;
    }

    previousOutputBlockScopeKeyRef.current = nextOutputBlockScopeKey;
    currentOutputBlockRef.current = '';
    latestCompletedOutputBlockRef.current = '';
    setHasRenderableTerminalOutput(hasRenderableAgentTerminalOutput(replaySnapshot ?? ''));
  }, [backendSessionId, replaySnapshot, terminalSessionId]);

  useEffect(() => {
    if (hasRenderableTerminalOutput || !hasRenderableAgentTerminalOutput(replaySnapshot ?? '')) {
      return;
    }

    setHasRenderableTerminalOutput(true);
  }, [hasRenderableTerminalOutput, replaySnapshot]);

  // Handle Cmd+F / Ctrl+F
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyF') {
        e.preventDefault();
        if (isSearchOpen) {
          searchBarRef.current?.focus();
        } else {
          setIsSearchOpen(true);
        }
      }
      // Ctrl+G is now handled in handleCustomKey
    },
    [isSearchOpen]
  );

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    async (e: MouseEvent) => {
      if (isReadOnlyTranscript) {
        return;
      }

      e.preventDefault();
      onFocus?.();
      const latestOutputBlock = getLatestCopyableOutputBlock();
      const menuItems = buildAgentTerminalContextMenuItems({
        canMerge,
        hasSelection: terminal?.hasSelection() ?? false,
        hasLatestOutputBlock: Boolean(latestOutputBlock),
        t,
      });

      const selectedId = await window.electronAPI.contextMenu.show(menuItems);

      if (!selectedId) return;

      switch (selectedId) {
        case 'split':
          onSplit?.();
          break;
        case 'merge':
          onMerge?.();
          break;
        case 'clear':
          clear();
          currentOutputBlockRef.current = '';
          latestCompletedOutputBlockRef.current = '';
          break;
        case 'refresh':
          refreshRenderer();
          break;
        case 'copy':
          void copyTerminalSelectionToClipboard(terminal)
            .then(() => {
              restoreTerminalInteractionAfterCopy(terminal);
            })
            .catch(() => {});
          break;
        case 'copyLatestOutputBlock':
          if (latestOutputBlock) {
            void writeClipboardText(latestOutputBlock)
              .then(() => {
                restoreTerminalInteractionAfterCopy(terminal);
              })
              .catch(() => {});
          }
          break;
        case 'paste':
          void readClipboardText().then((text) => {
            terminal?.paste(text);
          });
          break;
        case 'pasteAttachment':
          void pasteClipboardImageAttachment();
          break;
        case 'selectAll':
          terminal?.selectAll();
          break;
      }
    },
    [
      terminal,
      clear,
      refreshRenderer,
      t,
      onSplit,
      canMerge,
      onMerge,
      onFocus,
      getLatestCopyableOutputBlock,
      pasteClipboardImageAttachment,
      isReadOnlyTranscript,
    ]
  );

  useEffect(() => {
    if (!isActive) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleKeyDown]);

  useEffect(() => {
    if (isReadOnlyTranscript) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const listenerDocument = container.ownerDocument;
    const listenerWindow = listenerDocument.defaultView ?? window;

    listenerWindow.addEventListener('mousedown', handleTerminalMouseSelectionStart, true);
    container.addEventListener('contextmenu', handleContextMenu);
    return () => {
      listenerWindow.removeEventListener('mousedown', handleTerminalMouseSelectionStart, true);
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [containerRef, handleContextMenu, handleTerminalMouseSelectionStart, isReadOnlyTranscript]);

  // Cleanup idle timer on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  const terminalWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || isReadOnlyTranscript) {
      return;
    }

    const handlePasteAttachmentRequest = () => {
      void pasteClipboardImageAttachment();
    };

    window.addEventListener(AGENT_ATTACHMENT_PASTE_EVENT_NAME, handlePasteAttachmentRequest);
    return () => {
      window.removeEventListener(AGENT_ATTACHMENT_PASTE_EVENT_NAME, handlePasteAttachmentRequest);
    };
  }, [isActive, isReadOnlyTranscript, pasteClipboardImageAttachment]);

  useEffect(() => {
    if (isReadOnlyTranscript) {
      return;
    }

    const wrapper = terminalWrapperRef.current;
    if (!wrapper) {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
      handleClipboardAttachmentPaste(event);
    };

    wrapper.addEventListener('paste', handlePaste, true);
    return () => wrapper.removeEventListener('paste', handlePaste, true);
  }, [handleClipboardAttachmentPaste, isReadOnlyTranscript]);

  useEffect(() => {
    if (!isActive || isReadOnlyTranscript) {
      return;
    }

    const handleWindowPaste = (event: ClipboardEvent) => {
      const wrapper = terminalWrapperRef.current;
      if (wrapper && event.target instanceof Node && wrapper.contains(event.target)) {
        return;
      }

      if (isEditableAgentTerminalClipboardPasteTarget(event.target)) {
        return;
      }

      handleClipboardAttachmentPaste(event);
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [handleClipboardAttachmentPaste, isActive, isReadOnlyTranscript]);

  // Keep native terminal input sessions writable after focus moves to session chrome or other UI.
  const handleClick = useCallback(() => {
    if (isReadOnlyTranscript) {
      terminalFocusRef.current?.();
      return;
    }

    if (!isActive) {
      onFocus?.();
      requestAnimationFrame(() => terminalFocusRef.current?.());
      return;
    }

    terminalFocusRef.current?.();
  }, [isActive, isReadOnlyTranscript, onFocus]);

  const sendTerminalMessage = useCallback(
    (message: string, delay: number, onSent?: () => void) => {
      if (isReadOnlyTranscript) {
        return false;
      }

      if (!message || !inputDispatchSessionId) {
        return false;
      }
      if (runtimeStateRef.current !== 'live') {
        return false;
      }

      void window.electronAPI.agentInput
        .dispatch({
          sessionId: inputDispatchSessionId,
          agentId,
          text: message,
          submit: true,
          submitDelayMs: delay,
        })
        .then(() => {
          onSent?.();
        })
        .catch((error) => {
          console.error('[AgentTerminal] Failed to dispatch agent input', error);
        });
      terminalFocusRef.current?.();
      return true;
    },
    [inputDispatchSessionId, agentId, isReadOnlyTranscript]
  );

  // Handle enhanced input send
  const handleEnhancedInputSend = useCallback(
    (content: string, attachments: AgentAttachmentItem[]) => {
      const message = buildAgentAttachmentMessage(content, attachments);
      if (!message) {
        return false;
      }

      const sent = sendTerminalMessage(
        message,
        resolveAgentAttachmentSendDelay(message, attachments),
        () => activateSessionFromInput(content)
      );
      return sent;
    },
    [activateSessionFromInput, sendTerminalMessage]
  );

  useEffect(() => {
    if (!terminalSessionId) return;
    onRegisterEnhancedInputSender?.(terminalSessionId, handleEnhancedInputSend);
    return () => {
      onUnregisterEnhancedInputSender?.(terminalSessionId);
    };
  }, [
    terminalSessionId,
    handleEnhancedInputSend,
    onRegisterEnhancedInputSender,
    onUnregisterEnhancedInputSender,
  ]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: click is for focus activation
    <div
      ref={terminalWrapperRef}
      className="relative h-full w-full"
      data-agent-host-scrollback={isTmuxHostScrollbackActive ? 'true' : 'false'}
      data-agent-terminal-mode={isReadOnlyTranscript ? 'transcript' : 'live'}
      {...{ [AGENT_CANVAS_SCROLL_SURFACE_ATTRIBUTE]: 'true' }}
      style={{ backgroundColor: settings.theme.background, contain: 'strict' }}
      onClick={handleClick}
    >
      <div ref={containerRef} className="h-full w-full" />
      <TerminalSearchBar
        ref={searchBarRef}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onFindNext={findNext}
        onFindPrevious={findPrevious}
        onClearSearch={clearSearch}
        searchState={searchState}
        theme={settings.theme}
      />
      {showScrollToBottom && (
        <button
          {...{ [AGENT_TERMINAL_FLOATING_CONTROL_ATTRIBUTE]: 'true' }}
          aria-label={t('Scroll to bottom')}
          type="button"
          onClick={handleScrollToBottom}
          className={cn(
            'absolute z-20 flex items-center justify-center rounded-full border border-primary/30 bg-primary/14 text-primary transition-[background-color,transform] hover:bg-primary/22 hover:scale-105 active:scale-95',
            isMouseSelectingTerminal && 'pointer-events-none',
            AGENT_CHAT_FLOATING_ACTION_BUTTON_SIZE_CLASS,
            AGENT_CHAT_SCROLL_TO_BOTTOM_OFFSET_CLASS
          )}
          title={t('Scroll to bottom')}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
      {shouldShowAgentStartupOverlay && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 py-5"
          data-agent-terminal-startup-overlay="true"
          data-agent-terminal-startup-state={agentStartupOverlayPresentation.state}
          role="status"
          aria-live="polite"
          aria-label={t('Session startup status')}
        >
          <div
            className="control-panel-muted agent-terminal-startup-banner pointer-events-auto flex w-[min(20rem,100%)] min-w-0 items-center gap-3 rounded-2xl px-4 py-3"
            data-state={agentStartupOverlayPresentation.state}
          >
            <div
              className="agent-terminal-startup-indicator-shell flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              data-state={agentStartupOverlayPresentation.state}
            >
              <div
                className="agent-terminal-startup-dot h-2 w-2 rounded-full motion-safe:animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
                data-state={agentStartupOverlayPresentation.state}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="ui-type-label truncate text-[0.64rem] text-muted-foreground/64">
                {t(agentStartupOverlayPresentation.eyebrowKey)}
              </div>
              <div className="ui-type-body-sm mt-0.5 truncate font-semibold text-foreground/94">
                {t(agentStartupOverlayPresentation.titleKey)}
              </div>
              <div className="ui-type-meta mt-0.5 truncate text-muted-foreground/70">
                {t(agentStartupOverlayPresentation.descriptionKey)}
              </div>
            </div>
            {showAgentStartupRetryAction ? (
              <button
                type="button"
                onClick={handleRetryAgentStartup}
                className={cn(
                  'control-floating-button agent-terminal-startup-retry h-7 shrink-0 rounded-lg px-2.5 text-xs font-medium',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0'
                )}
                title={t('Retry')}
                aria-label={t('Retry')}
              >
                {t('Retry')}
              </button>
            ) : null}
          </div>
        </div>
      )}
      {terminalOverlayPresentation && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-[color:color-mix(in_oklch,var(--background)_56%,transparent)] backdrop-blur-[1px]"
          data-agent-terminal-runtime-overlay="true"
          role="status"
          aria-live="polite"
        >
          <div className="control-floating-muted rounded-xl px-4 py-3 text-center">
            <div className="text-sm font-medium">{t(terminalOverlayPresentation.titleKey)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t(terminalOverlayPresentation.descriptionKey)}
            </div>
            {terminalOverlayPresentation.showRetry ? (
              <button
                type="button"
                onClick={handleRetryAgentStartup}
                className={cn(
                  'control-floating-button mt-3 h-7 rounded-lg px-3 text-xs font-medium',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0'
                )}
                title={t('Retry')}
                aria-label={t('Retry')}
              >
                {t('Retry')}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
