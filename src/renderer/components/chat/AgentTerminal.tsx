import { TEMP_INPUT_FILE_PREFIX } from '@shared/paths';
import type { ClaudeIdeBridgeStatus, SessionRuntimeState } from '@shared/types';
import { ArrowDown } from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TerminalSearchBar,
  type TerminalSearchBarRef,
} from '@/components/terminal/TerminalSearchBar';
import { toastManager } from '@/components/ui/toast';
import { useAgentProviderSessionDiscovery } from '@/hooks/useAgentProviderSessionDiscovery';
import { type DroppedFileDescriptor, useFileDrop } from '@/hooks/useFileDrop';
import { useRepositoryRuntimeContext } from '@/hooks/useRepositoryRuntimeContext';
import { useTerminalScrollToBottom } from '@/hooks/useTerminalScrollToBottom';
import { useXterm } from '@/hooks/useXterm';
import {
  copyTerminalSelectionToClipboard,
  readClipboardText,
  writeClipboardText,
} from '@/hooks/xtermClipboard';
import { useI18n } from '@/i18n';
import { showRendererNotification } from '@/lib/electronNotification';
import {
  buildChatInputToastCopy,
  buildChatNotificationCopy,
  buildFileWorkflowToastCopy,
} from '@/lib/feedbackCopy';
import { resolveTerminalRuntimeOverlayState } from '@/lib/terminalRuntimeOverlay';
import { type OutputState, useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalWriteStore } from '@/stores/terminalWrite';
import { AgentAttachmentTray } from './AgentAttachmentTray';
import {
  type AgentAttachmentSource,
  partitionResolvedAgentAttachments,
  resolveAgentAttachmentTargetsFromFiles,
  shouldRouteAgentAttachmentToTray,
} from './agentAttachmentInput';
import {
  type AgentAttachmentItem,
  buildAgentAttachmentInsertText,
  buildAgentAttachmentMessage,
  mergeAgentAttachments,
  resolveAgentAttachmentSendDelay,
} from './agentAttachmentTrayModel';
import {
  resolveAgentInputAvailability,
  resolveAgentInputUnavailableReason,
} from './agentInputAvailability';
import { supportsAgentNativeTerminalInput } from './agentInputMode';
import { buildAgentLaunchPlan } from './agentLaunchPlan';
import { canInsertAgentTerminalAttachments } from './agentTerminalAttachmentInsertPolicy';
import { shouldCaptureAgentTerminalClipboardFiles } from './agentTerminalClipboardPastePolicy';
import { buildAgentTerminalContextMenuItems } from './agentTerminalContextMenu';
import { appendRecentAgentOutput, resolveCopyableAgentOutputBlock } from './agentTerminalOutput';
import { isClaudeWorkspaceTrustPrompt } from './claudeTrustPrompt';

interface AgentTerminalProps {
  id?: string; // Terminal session ID (UI key)
  createdAt?: number;
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
  isActive?: boolean;
  hasPendingCommand?: boolean; // Force terminal activation even when not visible
  initialPrompt?: string; // Initial prompt to pass as CLI argument (auto-execute)
  canMerge?: boolean; // whether merge option should be enabled (has multiple groups)
  /**
   * When provided, Enhanced Input open state is controlled by parent (e.g. AgentPanel store).
   * When omitted, AgentTerminal falls back to its own local state.
   */
  enhancedInputOpen?: boolean;
  onEnhancedInputOpenChange?: (open: boolean) => void;
  onInitialized?: () => void;
  onActivated?: () => void;
  /** Called when session is activated with the current line content (for session name fallback). */
  onActivatedWithFirstLine?: (line: string) => void;
  onExit?: () => void;
  onTerminalTitleChange?: (title: string) => void;
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
  onRuntimeStateChange?: (state: SessionRuntimeState) => void;
}

const MIN_OUTPUT_FOR_NOTIFICATION = 100; // Minimum chars to consider agent is doing work
const MIN_OUTPUT_FOR_INDICATOR = 200; // Minimum chars to show "outputting" indicator (higher to avoid noise)
const ACTIVITY_POLL_INTERVAL_MS = 1000; // Poll process activity every 1000ms
const IDLE_CONFIRMATION_COUNT = 2; // Require 2 consecutive idle polls (2 seconds) before marking as idle
const RECENT_OUTPUT_TIMEOUT_MS = 3000; // If output received within this time, consider still active

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

export function AgentTerminal({
  id,
  createdAt,
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
  isActive = false,
  hasPendingCommand = false,
  initialPrompt,
  canMerge = false,
  enhancedInputOpen: externalEnhancedInputOpen,
  onEnhancedInputOpenChange,
  onInitialized,
  onActivated,
  onActivatedWithFirstLine,
  onExit,
  onTerminalTitleChange,
  onSplit,
  onMerge,
  onFocus,
  onRegisterEnhancedInputSender,
  onUnregisterEnhancedInputSender,
  onBackendSessionIdChange,
  onProviderSessionIdChange,
  onRuntimeStateChange,
}: AgentTerminalProps) {
  const { t } = useI18n();
  const {
    agentNotificationEnabled,
    agentNotificationDelay,
    agentNotificationEnterDelay,
    hapiSettings,
    shellConfig,
    claudeCodeIntegration,
  } = useSettingsStore();
  const { data: runtimeContext } = useRepositoryRuntimeContext(cwd);
  const isRemoteExecution = runtimeContext?.kind === 'remote';
  const executionPlatform = window.electronAPI?.env?.platform;
  const runtimeChannel = window.electronAPI?.env?.runtimeChannel ?? 'prod';

  // Track if hapi is globally installed (cached in main process)
  const [hapiGlobalInstalled, setHapiGlobalInstalled] = useState<boolean | null>(null);
  const [claudeIdeStatus, setClaudeIdeStatus] = useState<ClaudeIdeBridgeStatus | null>(null);
  const [claudeWorkspaceTrusted, setClaudeWorkspaceTrusted] = useState<boolean | null>(null);

  // Resolved shell for command execution
  const [resolvedShell, setResolvedShell] = useState<{
    shell: string;
    execArgs: string[];
  } | null>(null);

  // Resolve shell configuration on mount and when shellConfig changes
  useEffect(() => {
    if (isRemoteExecution) {
      setResolvedShell(null);
      return;
    }
    window.electronAPI.shell.resolveForCommand(cwd, shellConfig).then(setResolvedShell);
  }, [cwd, isRemoteExecution, shellConfig]);

  // Check hapi global installation on mount (only for hapi environment)
  useEffect(() => {
    if (environment === 'hapi') {
      window.electronAPI.hapi.checkGlobal(cwd, false).then((status) => {
        setHapiGlobalInstalled(status.installed);
      });
    }
  }, [cwd, environment]);

  useEffect(() => {
    let cancelled = false;

    if (!agentCommand.startsWith('claude')) {
      setClaudeIdeStatus(null);
      return;
    }

    if (!claudeCodeIntegration.enabled) {
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

    setClaudeIdeStatus(null);
    window.electronAPI.mcp
      .getStatus(cwd)
      .then((status) => {
        if (!cancelled) {
          setClaudeIdeStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
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
  }, [agentCommand, claudeCodeIntegration.enabled, cwd]);
  useEffect(() => {
    let cancelled = false;
    hasAutoConfirmedTrustPromptRef.current = false;

    if (!agentCommand.startsWith('claude') || isRemoteExecution || !cwd) {
      setClaudeWorkspaceTrusted(true);
      return;
    }

    setClaudeWorkspaceTrusted(null);
    window.electronAPI.claudeConfig.projectTrust
      .ensureWorkspaceTrusted(cwd)
      .then((trusted) => {
        if (!cancelled) {
          setClaudeWorkspaceTrusted(trusted);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClaudeWorkspaceTrusted(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentCommand, cwd, isRemoteExecution]);
  const outputBufferRef = useRef('');
  const currentOutputBlockRef = useRef('');
  const latestCompletedOutputBlockRef = useRef('');
  const previousOutputBlockScopeKeyRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);
  const hasActivatedRef = useRef(false);
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
  const setOutputState = useAgentSessionsStore((s) => s.setOutputState);
  const markSessionActive = useAgentSessionsStore((s) => s.markSessionActive);
  const clearRuntimeState = useAgentSessionsStore((s) => s.clearRuntimeState);
  const getEnhancedInputState = useAgentSessionsStore((s) => s.getEnhancedInputState);
  const setEnhancedInputAttachments = useAgentSessionsStore((s) => s.setEnhancedInputAttachments);
  const appendAttachmentTrayAttachments = useAgentSessionsStore(
    (s) => s.appendAttachmentTrayAttachments
  );
  const setAttachmentTrayAttachments = useAgentSessionsStore((s) => s.setAttachmentTrayAttachments);
  const setAttachmentTrayImporting = useAgentSessionsStore((s) => s.setAttachmentTrayImporting);
  const clearAttachmentTray = useAgentSessionsStore((s) => s.clearAttachmentTray);

  const terminalSessionId = id ?? sessionId;
  const resumeSessionId = sessionId ?? id;
  const inputDispatchSessionId = backendSessionId ?? null;
  const usesNativeTerminalInput = supportsAgentNativeTerminalInput(agentId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useAgentProviderSessionDiscovery({
    agentCommand,
    uiSessionId: id,
    providerSessionId: sessionId,
    cwd,
    createdAt,
    initialized,
    isRemoteExecution,
    onProviderSessionIdChange,
  });
  const trayState = useAgentSessionsStore((state) =>
    terminalSessionId
      ? state.getAttachmentTrayState(terminalSessionId)
      : state.getAttachmentTrayState('__agent-terminal-unbound__')
  );
  const trayAttachments = trayState.attachments;
  const isTrayImporting = trayState.isImporting;

  // Use external control if provided, otherwise use local state.
  // IMPORTANT: `externalEnhancedInputOpen` can be false, so we must check `undefined` rather than truthiness.
  const [localEnhancedInputOpen, setLocalEnhancedInputOpen] = useState(false);
  const [attachmentTrayExpanded, setAttachmentTrayExpanded] = useState(false);
  const isExternallyControlled = externalEnhancedInputOpen !== undefined;
  const enhancedInputOpen = isExternallyControlled
    ? externalEnhancedInputOpen
    : localEnhancedInputOpen;
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

  const appendTrayAttachments = useCallback(
    (nextAttachments: AgentAttachmentItem[]) => {
      if (!terminalSessionId || nextAttachments.length === 0) {
        return;
      }
      appendAttachmentTrayAttachments(terminalSessionId, nextAttachments);
    },
    [appendAttachmentTrayAttachments, terminalSessionId]
  );

  const insertTerminalAttachmentText = useCallback(
    (nextAttachments: AgentAttachmentItem[]) => {
      const sessionId = inputDispatchSessionId;
      if (!sessionId) {
        return false;
      }

      if (
        !canInsertAgentTerminalAttachments({
          sessionId,
          attachmentCount: nextAttachments.length,
          runtimeState: runtimeStateRef.current,
          outputState: outputStateRef.current,
        })
      ) {
        return false;
      }

      const insertText = buildAgentAttachmentInsertText(nextAttachments);
      if (!insertText) {
        return false;
      }

      void window.electronAPI.agentInput
        .dispatch({
          sessionId,
          agentId,
          text: insertText,
        })
        .catch((error) => {
          console.error('[AgentTerminal] Failed to insert agent attachments', error);
        });
      terminalFocusRef.current?.();
      return true;
    },
    [inputDispatchSessionId, agentId]
  );

  const handleResolvedAttachmentTargets = useCallback(
    ({
      draftAttachments: nextDraftAttachments,
      trayAttachments: nextTrayAttachments,
    }: {
      draftAttachments: AgentAttachmentItem[];
      trayAttachments: AgentAttachmentItem[];
    }) => {
      if (nextDraftAttachments.length > 0) {
        if (usesNativeTerminalInput) {
          const inserted = insertTerminalAttachmentText(nextDraftAttachments);
          if (!inserted) {
            appendTrayAttachments(nextDraftAttachments);
          }
        } else if (claudeCodeIntegration.enhancedInputEnabled) {
          appendDraftAttachments(nextDraftAttachments);
        } else {
          appendTrayAttachments(nextDraftAttachments);
        }
      }
      if (nextTrayAttachments.length > 0) {
        appendTrayAttachments(nextTrayAttachments);
      }
    },
    [
      appendDraftAttachments,
      appendTrayAttachments,
      claudeCodeIntegration.enhancedInputEnabled,
      insertTerminalAttachmentText,
      usesNativeTerminalInput,
    ]
  );

  useEffect(() => {
    if (trayAttachments.length === 0 && attachmentTrayExpanded) {
      setAttachmentTrayExpanded(false);
    }
  }, [trayAttachments.length, attachmentTrayExpanded]);

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

  const saveClipboardImageToTemp = useCallback(
    async (file: File): Promise<string | null> => {
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
        return null;
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
        return null;
      }
    },
    [t]
  );

  const resolveAttachmentTargets = useCallback(
    async (
      files: File[],
      {
        preferTray = false,
        source = 'unknown',
      }: {
        preferTray?: boolean;
        source?: AgentAttachmentSource;
      } = {}
    ) => {
      if (files.length === 0) {
        return;
      }

      const shouldImportToTray =
        preferTray || files.some((file) => shouldRouteAgentAttachmentToTray(file.size));
      if (terminalSessionId && shouldImportToTray) {
        setAttachmentTrayImporting(terminalSessionId, true);
      }

      try {
        const targets = await resolveAgentAttachmentTargetsFromFiles(files, {
          preferTray,
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
        handleResolvedAttachmentTargets(targets);
      } finally {
        if (terminalSessionId && shouldImportToTray) {
          setAttachmentTrayImporting(terminalSessionId, false);
        }
      }
    },
    [
      handleResolvedAttachmentTargets,
      saveClipboardImageToTemp,
      saveAttachmentToTemp,
      setAttachmentTrayImporting,
      terminalSessionId,
    ]
  );

  const handleAttachmentInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : [];
      if (files.length === 0) {
        return;
      }

      await resolveAttachmentTargets(files, { preferTray: true, source: 'picker' });
      event.target.value = '';
    },
    [resolveAttachmentTargets]
  );

  const handlePickAttachmentFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Keep isActiveRef in sync with isActive prop
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Helper to update output state (with ref tracking to avoid unnecessary store updates)
  const updateOutputState = useCallback(
    (newState: OutputState) => {
      if (!terminalSessionId) return;
      if (outputStateRef.current === newState) return;
      outputStateRef.current = newState;
      // Use isActiveRef.current to get latest value (important for interval callbacks)
      setOutputState(terminalSessionId, newState, isActiveRef.current);

      // Hide enhanced input when agent starts running (hideWhileRunning mode)
      if (
        newState === 'outputting' &&
        !usesNativeTerminalInput &&
        agentId === 'claude' &&
        claudeCodeIntegration.enhancedInputEnabled &&
        claudeCodeIntegration.enhancedInputAutoPopup === 'hideWhileRunning'
      ) {
        onEnhancedInputOpenChange?.(false);
      }
    },
    [
      terminalSessionId,
      setOutputState,
      agentId,
      claudeCodeIntegration,
      onEnhancedInputOpenChange,
      usesNativeTerminalInput,
    ]
  );

  const getLatestCopyableOutputBlock = useCallback(() => {
    return (
      resolveCopyableAgentOutputBlock(currentOutputBlockRef.current) ??
      resolveCopyableAgentOutputBlock(latestCompletedOutputBlockRef.current)
    );
  }, []);

  // Mark session as active when user is viewing it
  useEffect(() => {
    if (isActive && terminalSessionId) {
      markSessionActive(terminalSessionId);
    }
  }, [isActive, terminalSessionId, markSessionActive]);

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
    }, ACTIVITY_POLL_INTERVAL_MS);
  }, [updateOutputState]);

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
      stopActivityPolling();
    };
  }, [terminalSessionId, clearRuntimeState, stopActivityPolling]);

  // Build command with session args
  const { command, env, initialCommand } = useMemo(() => {
    const plan = buildAgentLaunchPlan({
      agentCommand,
      customPath,
      customArgs,
      initialPrompt,
      resumeSessionId,
      initialized,
      environment,
      hapiGlobalInstalled,
      hapiCliApiToken: hapiSettings.cliApiToken,
      isRemoteExecution,
      executionPlatform,
      enableIdeIntegration: claudeIdeStatus?.canUseIde ?? false,
      tmuxEnabled: claudeCodeIntegration.tmuxEnabled,
      resolvedShell,
      terminalSessionId,
      runtimeChannel,
    });
    return {
      command: plan.command
        ? {
            ...plan.command,
            fallbackCommand: plan.fallbackCommand,
          }
        : undefined,
      env: plan.env,
      initialCommand: plan.initialCommand,
    };
  }, [
    agentCommand,
    claudeIdeStatus?.canUseIde,
    customPath,
    customArgs,
    initialPrompt,
    resumeSessionId,
    initialized,
    environment,
    hapiSettings.cliApiToken,
    hapiGlobalInstalled,
    isRemoteExecution,
    executionPlatform,
    claudeCodeIntegration.tmuxEnabled,
    resolvedShell,
    terminalSessionId,
    runtimeChannel,
  ]);

  // Preserve exited sessions in the UI so users can inspect the final output and state.
  const handleExit = useCallback(() => {
    onExit?.();
  }, [onExit]);

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
        claudeCodeIntegration.stopHookEnabled && agentCommand.startsWith('claude');

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
              action: 'command-completed',
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
      claudeCodeIntegration.stopHookEnabled,
      terminalSessionId,
      t,
      updateOutputState,
    ]
  );

  // Handle terminal title changes (OSC escape sequences)
  const handleTitleChange = useCallback(
    (title: string) => {
      currentTitleRef.current = title;
      onTerminalTitleChange?.(title);
    },
    [onTerminalTitleChange]
  );

  // Handle Shift+Enter for newline (Ctrl+J / LF for all agents)
  // Also detect Enter key press to mark session as activated
  // biome-ignore lint/correctness/useExhaustiveDependencies: terminal is accessed via try-catch for safety and defined after this callback
  const handleCustomKey = useCallback(
    (event: KeyboardEvent, ptyId: string, getCurrentLine?: () => string | null) => {
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
        !usesNativeTerminalInput
      ) {
        if (claudeCodeIntegration.enhancedInputEnabled) {
          setEnhancedInputOpen(!enhancedInputOpen);
          return false; // Block the key event only when enhanced input is enabled
        }
        // When enhanced input is disabled, let the event pass through to terminal
      }

      // Detect Enter key press (without modifiers) to activate session and start idle monitoring
      // Skip if IME is composing (e.g. selecting Chinese characters)
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.isComposing
      ) {
        const completedOutputBlock = resolveCopyableAgentOutputBlock(currentOutputBlockRef.current);
        if (completedOutputBlock) {
          latestCompletedOutputBlockRef.current = currentOutputBlockRef.current;
        }
        currentOutputBlockRef.current = '';

        // First Enter activates the session; optionally pass current line for session name.
        if (!hasActivatedRef.current && !activated) {
          hasActivatedRef.current = true;
          onActivated?.();
          if (getCurrentLine && onActivatedWithFirstLine) {
            const line = getCurrentLine();
            if (line) onActivatedWithFirstLine(line);
          }
        }
        // Reset output counter.
        dataSinceEnterRef.current = 0;

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
      activated,
      onActivated,
      onActivatedWithFirstLine,
      agentNotificationEnterDelay,
      startActivityPolling,
      terminalSessionId,
      agentId,
      claudeCodeIntegration.enhancedInputEnabled,
      enhancedInputOpen,
      setEnhancedInputOpen,
      usesNativeTerminalInput,
      // Note: terminal is excluded as it's defined after this callback
      // and accessed via try-catch for safety
    ]
  );

  // Wait for shell config and hapi check to complete before activating terminal
  const effectiveIsActive = useMemo(() => {
    if (
      agentCommand.startsWith('claude') &&
      claudeCodeIntegration.enabled &&
      claudeIdeStatus === null
    ) {
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
    // Force activation when there's a pending command (auto-execute)
    return isActive || hasPendingCommand;
  }, [
    environment,
    hapiGlobalInstalled,
    isActive,
    agentCommand,
    claudeCodeIntegration.enabled,
    claudeIdeStatus,
    claudeWorkspaceTrusted,
    isRemoteExecution,
    resolvedShell,
    hasPendingCommand,
  ]);

  const {
    containerRef,
    isLoading,
    runtimeState,
    settings,
    findNext,
    findPrevious,
    searchState,
    clearSearch,
    terminal,
    clear,
    refreshRenderer,
    write,
  } = useXterm({
    cwd,
    backendSessionId,
    command,
    env,
    initialCommand,
    isActive: effectiveIsActive,
    kind: 'agent',
    metadata:
      persistenceEnabled && terminalSessionId
        ? {
            uiSessionId: terminalSessionId,
            agentId,
            agentCommand,
            environment,
          }
        : undefined,
    persistOnDisconnect: true,
    retryOnDeadSession: false,
    onExit: handleExit,
    onData: handleData,
    onCustomKey: handleCustomKey,
    onTitleChange: handleTitleChange,
    onSessionIdChange: onBackendSessionIdChange,
    onSplit,
    onMerge,
    canMerge,
  });
  trustPromptSubmitRef.current = write;
  terminalFocusRef.current = () => terminal?.focus();
  runtimeStateRef.current = runtimeState;
  const agentInputAvailability = resolveAgentInputAvailability({
    backendSessionId: inputDispatchSessionId,
    runtimeState,
  });
  const canDispatchAgentInput = agentInputAvailability === 'ready';
  useEffect(() => {
    onRuntimeStateChange?.(runtimeState);
  }, [onRuntimeStateChange, runtimeState]);
  const terminalOverlayState = resolveTerminalRuntimeOverlayState({
    isLoading,
    isRemoteExecution,
    runtimeState,
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchBarRef = useRef<TerminalSearchBarRef>(null);

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

    requestAnimationFrame(() => terminal?.focus());
  }, [enhancedInputOpen, terminal]);
  const { showScrollToBottom, handleScrollToBottom } = useTerminalScrollToBottom(terminal);

  // Register write and focus functions to global store for external access
  const { register, unregister } = useTerminalWriteStore();
  useEffect(() => {
    if (!terminalSessionId || !write) return;

    register(terminalSessionId, write, () => terminal?.focus());
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
  }, [backendSessionId, terminalSessionId]);

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
          void copyTerminalSelectionToClipboard(terminal).catch(() => {});
          break;
        case 'copyLatestOutputBlock':
          if (latestOutputBlock) {
            void writeClipboardText(latestOutputBlock).catch(() => {});
          }
          break;
        case 'paste':
          void readClipboardText().then((text) => {
            terminal?.paste(text);
          });
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
    ]
  );

  useEffect(() => {
    if (!isActive) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleKeyDown]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [handleContextMenu, containerRef]);

  // Cleanup idle timer on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  // Handle external file drop (from OS file manager, VS Code, etc.)
  const terminalWrapperRef = useFileDrop<HTMLDivElement>({
    cwd,
    onDrop: useCallback(
      (files: DroppedFileDescriptor[]) => {
        handleResolvedAttachmentTargets(partitionResolvedAgentAttachments(files));
      },
      [handleResolvedAttachmentTargets]
    ),
  });

  useEffect(() => {
    const wrapper = terminalWrapperRef.current;
    if (!wrapper) {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items || items.length === 0) {
        return;
      }

      const files: File[] = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item.kind !== 'file') {
          continue;
        }
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }

      if (files.length === 0) {
        return;
      }

      if (!shouldCaptureAgentTerminalClipboardFiles(agentId, files)) {
        return;
      }

      event.preventDefault();
      void resolveAttachmentTargets(files, { source: 'clipboard' });
    };

    wrapper.addEventListener('paste', handlePaste, true);
    return () => wrapper.removeEventListener('paste', handlePaste, true);
  }, [agentId, resolveAttachmentTargets, terminalWrapperRef]);

  // Handle click to activate group
  const handleClick = useCallback(() => {
    if (!isActive) {
      onFocus?.();
    }
  }, [isActive, onFocus]);

  const sendTerminalMessage = useCallback(
    (message: string, delay: number) => {
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
        .catch((error) => {
          console.error('[AgentTerminal] Failed to dispatch agent input', error);
        });
      terminalFocusRef.current?.();
      return true;
    },
    [inputDispatchSessionId, agentId]
  );

  const handleAttachmentSend = useCallback(() => {
    if (usesNativeTerminalInput) {
      const didInsert = insertTerminalAttachmentText(trayAttachments);
      if (!didInsert) {
        return;
      }
    } else {
      const message = buildAgentAttachmentMessage('', trayAttachments);
      if (!message) {
        return;
      }

      const didSend = sendTerminalMessage(
        message,
        resolveAgentAttachmentSendDelay(message, trayAttachments)
      );
      if (!didSend) {
        return;
      }
    }

    if (terminalSessionId) {
      clearAttachmentTray(terminalSessionId);
    }
    setAttachmentTrayExpanded(false);
  }, [
    clearAttachmentTray,
    insertTerminalAttachmentText,
    sendTerminalMessage,
    terminalSessionId,
    trayAttachments,
    usesNativeTerminalInput,
  ]);

  // Handle enhanced input send
  const handleEnhancedInputSend = useCallback(
    (content: string, attachments: AgentAttachmentItem[]) => {
      const message = buildAgentAttachmentMessage(content, attachments);
      if (!message) {
        return false;
      }

      return sendTerminalMessage(message, resolveAgentAttachmentSendDelay(message, attachments));
    },
    [sendTerminalMessage]
  );

  useEffect(() => {
    if (!terminalSessionId || supportsAgentNativeTerminalInput(agentId)) return;
    onRegisterEnhancedInputSender?.(terminalSessionId, handleEnhancedInputSend);
    return () => {
      onUnregisterEnhancedInputSender?.(terminalSessionId);
    };
  }, [
    agentId,
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
      style={{ backgroundColor: settings.theme.background, contain: 'strict' }}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleAttachmentInputChange(event);
        }}
      />
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
          aria-label={t('Scroll to bottom')}
          type="button"
          onClick={handleScrollToBottom}
          className="absolute bottom-12 right-3 flex h-11 w-11 items-center justify-center rounded-full border border-primary/30 bg-primary/14 text-primary transition-[background-color,transform] hover:bg-primary/22 hover:scale-105 active:scale-95"
          title={t('Scroll to bottom')}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
      <AgentAttachmentTray
        attachments={trayAttachments}
        expanded={attachmentTrayExpanded}
        canSend={canDispatchAgentInput}
        primaryActionLabel={
          agentInputAvailability === 'awaiting-session'
            ? t('Awaiting Session')
            : agentInputAvailability === 'reconnecting'
              ? t('Reconnecting')
              : agentInputAvailability === 'disconnected'
                ? t('Disconnected')
                : usesNativeTerminalInput
                  ? t('Insert attachments')
                  : undefined
        }
        primaryActionHint={resolveAgentInputUnavailableReason({
          agentCommand,
          availability: agentInputAvailability,
          isRemoteExecution,
          t,
        })}
        isProcessing={isTrayImporting}
        onExpandedChange={setAttachmentTrayExpanded}
        onPickFiles={handlePickAttachmentFiles}
        onRemoveAttachment={(attachmentId) => {
          if (!terminalSessionId) {
            return;
          }
          setAttachmentTrayAttachments(
            terminalSessionId,
            trayAttachments.filter((attachment) => attachment.id !== attachmentId)
          );
        }}
        onClear={() => {
          if (terminalSessionId) {
            clearAttachmentTray(terminalSessionId);
          }
          setAttachmentTrayExpanded(false);
        }}
        onSend={handleAttachmentSend}
      />
      {(isLoading ||
        (agentCommand.startsWith('claude') &&
          !isRemoteExecution &&
          claudeWorkspaceTrusted === null) ||
        (agentCommand.startsWith('claude') &&
          claudeCodeIntegration.enabled &&
          claudeIdeStatus === null) ||
        (!isRemoteExecution && !resolvedShell) ||
        (environment === 'hapi' && hapiGlobalInstalled === null)) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: settings.theme.foreground, opacity: 0.5 }}
            />
            <span style={{ color: settings.theme.foreground, opacity: 0.5 }} className="text-sm">
              {t('Loading {{agent}}...', { agent: agentCommand })}
            </span>
          </div>
        </div>
      )}
      {terminalOverlayState && (
        <div className="absolute inset-0 flex items-center justify-center bg-[color:color-mix(in_oklch,var(--background)_56%,transparent)] backdrop-blur-[1px]">
          <div className="control-floating-muted rounded-xl px-4 py-3 text-center">
            <div className="text-sm font-medium">
              {terminalOverlayState === 'reconnecting'
                ? t('Remote terminal reconnecting...')
                : t('Remote terminal disconnected')}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {terminalOverlayState === 'reconnecting'
                ? t('Remote terminal input is temporarily disabled while reconnecting.')
                : t('Remote terminal has disconnected. Reconnect the remote host to continue.')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
