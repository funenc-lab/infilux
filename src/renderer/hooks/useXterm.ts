import type {
  SessionCreateOptions,
  SessionDescriptor,
  SessionKind,
  SessionRuntimeState,
} from '@shared/types';
import { createAgentStartupTimelineLogger } from '@shared/utils/agentStartupTimeline';
import { appendPersistentAgentReplaySnapshot } from '@shared/utils/persistentAgentSession';
import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { getRendererEnvironment } from '@/lib/electronEnvironment';
import { defaultDarkTheme, getXtermTheme } from '@/lib/ghosttyTheme';
import { matchesKeybinding } from '@/lib/keybinding';
import {
  buildTerminalSearchDecorations,
  createEmptyTerminalSearchState,
  createTerminalSearchState,
  type TerminalSearchState,
} from '@/lib/terminalSearchState';
import {
  subscribeToXtermVisibilityChange,
  subscribeToXtermWindowFocus,
  subscribeToXtermWindowResize,
} from '@/lib/xtermWindowEvents';
import { useNavigationStore } from '@/stores/navigation';
import { useSettingsStore } from '@/stores/settings';
import { recordAgentStartup } from '@/utils/logging';
import { scheduleXtermActivationRefresh } from './xtermActivationRefresh';
import { attachAgentTranscriptMode } from './xtermAgentTranscriptPolicy';
import {
  copyTerminalSelectionToClipboard,
  getTerminalSelectionText,
  restoreTerminalInteractionAfterCopy,
  shouldHandleTerminalCopyEvent,
  writeClipboardText,
} from './xtermClipboard';
import { isXtermContainerReady, scheduleXtermContainerReady } from './xtermContainerReady';
import { resolveXtermRenderer } from './xtermRendererPolicy';
import {
  buildXtermRecoveryAttemptKey,
  createXtermSessionBindingSnapshot,
  resolveRecoveredInitialTerminalReplay,
  resolveRecoveredReplaySnapshotPersistence,
  resolveReusableBackendSessionId,
  shouldApplyInitialTerminalReplay,
  shouldAttemptDeadSessionRecovery,
  shouldRearmDeadSessionRecovery,
  shouldRebindXtermSession,
  shouldRetrySessionCreateWithoutHost,
} from './xtermSessionRecovery';
import { buildXtermTerminalOptions } from './xtermTerminalOptions';
import { syncXtermViewportToSession } from './xtermViewportSync';
import { attachPersistentCustomWheelEventHandler } from './xtermWheelHandlerPersistence';
import { resolveAgentWheelPolicy } from './xtermWheelPolicy';
import '@xterm/xterm/css/xterm.css';

interface InfiluxE2ETerminalWindow extends Window {
  __INFILUX_E2E_ENABLE__?: boolean;
  __INFILUX_E2E_LAST_XTERM__?: Terminal;
}

// Regex to match file paths with optional line:column
// Matches: useXterm.ts:42 or path/to/file.ts:42 or ./file.ts:10 or @src/file.ts:42
// Note: longer extensions must come before shorter ones (tsx before ts, jsx before js, json before js, etc.)
const FILE_PATH_REGEX =
  /(?:^|[\s'"({[@])((?:\.{1,2}\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:tsx|ts|jsx|json|mjs|cjs|js|scss|css|less|html|vue|svelte|md|yaml|yml|toml|py|go|rs|java|cpp|hpp|c|h|rb|php|bash|zsh|sh))(?::(\d+))?(?::(\d+))?/g;

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require ESC character
const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;?]*[a-zA-Z]/g;

// Maximum length for session name derived from terminal current line
const SESSION_NAME_MAX_LENGTH = 36;
const HOST_SCROLL_FLUSH_DELAY_MS = 16;

interface InternalTerminalSearchDecorations {
  matchBackground?: string;
  matchBorder?: string;
  matchOverviewRuler: string;
  activeMatchBackground?: string;
  activeMatchBorder?: string;
  activeMatchColorOverviewRuler: string;
}

interface InternalTerminalSearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  incremental?: boolean;
  decorations?: InternalTerminalSearchDecorations;
}

interface InternalTerminalSearchResultChange {
  resultIndex: number;
  resultCount: number;
}

interface XtermStaticContent {
  text: string;
  identity?: string;
}

interface XtermCommandOptions {
  shell: string;
  args: string[];
  fallbackCommand?: {
    shell: string;
    args: string[];
  };
}

interface PendingHostScrollRequest {
  cwd?: string;
  sessionName: string;
  serverName?: string;
  direction: 'up' | 'down';
  amount: number;
}

export interface XtermSessionCreateFallbackOptions {
  command?: XtermCommandOptions;
  env?: Record<string, string>;
  hostSession?: SessionCreateOptions['hostSession'];
  initialCommand?: string;
  onRetry?: () => void;
}

export interface UseXtermOptions {
  backendSessionId?: string;
  cwd?: string;
  command?: XtermCommandOptions;
  env?: Record<string, string>;
  hostSession?: SessionCreateOptions['hostSession'];
  metadata?: Record<string, unknown>;
  isActive?: boolean;
  isVisible?: boolean;
  fontSizeScale?: number;
  preferCompatibilityRenderer?: boolean;
  initialCommand?: string;
  activateOnInitialCommandWhenInactive?: boolean;
  kind?: SessionKind;
  persistOnDisconnect?: boolean;
  preferHostScrollback?: boolean;
  retryOnDeadSession?: boolean;
  sessionCreateFallback?: XtermSessionCreateFallbackOptions;
  recoveredReplaySnapshot?: string;
  staticContent?: XtermStaticContent;
  onExit?: () => void;
  onData?: (data: string) => void;
  onReplaySnapshotChange?: (snapshot: string | undefined, capturedAt: number | undefined) => void;
  onCustomKey?: (
    event: KeyboardEvent,
    ptyId: string,
    getCurrentLine?: () => string | null
  ) => boolean;
  onTitleChange?: (title: string) => void;
  onInit?: (ptyId: string) => void;
  onSessionIdChange?: (sessionId: string) => void;
  onSessionOpen?: (session: SessionDescriptor) => void;
  onHostScrollbackStateChange?: (active: boolean) => void;
  onSplit?: () => void;
  onMerge?: () => void;
  canMerge?: boolean;
}

export interface UseXtermResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  runtimeState: SessionRuntimeState;
  settings: ReturnType<typeof useTerminalSettings>;
  /** Write data to pty */
  write: (data: string) => void;
  /** Manually trigger fit */
  fit: () => void;
  /** Get current terminal instance */
  terminal: Terminal | null;
  /** Search for text in terminal */
  findNext: (
    term: string,
    options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ) => boolean;
  /** Search backwards for text */
  findPrevious: (
    term: string,
    options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ) => boolean;
  searchState: TerminalSearchState;
  /** Clear search decorations */
  clearSearch: () => void;
  /** Clear terminal display */
  clear: () => void;
  /** Manually refresh renderer (clear WebGL atlas + refresh) */
  refreshRenderer: () => void;
  /** Restart the current session binding */
  restartSession: () => void;
}

function useTerminalSettings(fontSizeScale = 1) {
  const {
    terminalTheme,
    terminalFontSize,
    terminalFontFamily,
    terminalFontWeight,
    terminalFontWeightBold,
    terminalScrollback,
    terminalOptionIsMeta,
    xtermKeybindings,
    backgroundImageEnabled,
  } = useSettingsStore(
    useShallow((state) => ({
      terminalTheme: state.terminalTheme,
      terminalFontSize: state.terminalFontSize,
      terminalFontFamily: state.terminalFontFamily,
      terminalFontWeight: state.terminalFontWeight,
      terminalFontWeightBold: state.terminalFontWeightBold,
      terminalScrollback: state.terminalScrollback,
      terminalOptionIsMeta: state.terminalOptionIsMeta,
      xtermKeybindings: state.xtermKeybindings,
      backgroundImageEnabled: state.backgroundImageEnabled,
    }))
  );

  const theme = useMemo(() => {
    const baseTheme = getXtermTheme(terminalTheme) ?? defaultDarkTheme;
    if (backgroundImageEnabled) {
      return { ...baseTheme, background: 'transparent' };
    }
    return baseTheme;
  }, [terminalTheme, backgroundImageEnabled]);

  const safeFontSizeScale = Number.isFinite(fontSizeScale) && fontSizeScale > 0 ? fontSizeScale : 1;

  return useMemo(
    () => ({
      theme,
      fontSize: Math.max(10, Math.round(terminalFontSize * safeFontSizeScale)),
      fontFamily: terminalFontFamily,
      fontWeight: terminalFontWeight,
      fontWeightBold: terminalFontWeightBold,
      scrollback: terminalScrollback,
      optionIsMeta: terminalOptionIsMeta,
      xtermKeybindings,
      backgroundImageEnabled,
    }),
    [
      backgroundImageEnabled,
      safeFontSizeScale,
      terminalFontFamily,
      terminalFontSize,
      terminalFontWeight,
      terminalFontWeightBold,
      terminalOptionIsMeta,
      terminalScrollback,
      theme,
      xtermKeybindings,
    ]
  );
}

export function useXterm({
  backendSessionId,
  cwd,
  command,
  env,
  hostSession,
  metadata,
  isActive = true,
  isVisible = isActive,
  fontSizeScale = 1,
  preferCompatibilityRenderer = false,
  initialCommand,
  activateOnInitialCommandWhenInactive = true,
  kind = 'terminal',
  persistOnDisconnect = false,
  preferHostScrollback = false,
  retryOnDeadSession = true,
  sessionCreateFallback,
  recoveredReplaySnapshot,
  staticContent,
  onExit,
  onData,
  onReplaySnapshotChange,
  onCustomKey,
  onTitleChange,
  onInit,
  onSessionIdChange,
  onSessionOpen,
  onHostScrollbackStateChange,
  onSplit,
  onMerge,
  canMerge = false,
}: UseXtermOptions): UseXtermResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const settings = useTerminalSettings(fontSizeScale);
  const { terminalRenderer, copyOnSelection, shellConfig } = useSettingsStore(
    useShallow((state) => ({
      terminalRenderer: state.terminalRenderer,
      copyOnSelection: state.copyOnSelection,
      shellConfig: state.shellConfig,
    }))
  );
  const navigateToFile = useNavigationStore((s) => s.navigateToFile);
  const effectiveTerminalRenderer = useMemo(
    () =>
      resolveXtermRenderer({
        requestedRenderer: terminalRenderer,
        preferCompatibilityRenderer,
      }),
    [preferCompatibilityRenderer, terminalRenderer]
  );
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const sessionEventsCleanupRef = useRef<(() => void) | null>(null);
  const terminalInputCleanupRef = useRef<{ dispose: () => void } | null>(null);
  const transcriptModeCleanupRef = useRef<{ dispose: () => void } | null>(null);
  const linkProviderDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const rendererAddonRef = useRef<{ dispose: () => void } | null>(null);
  const copyOnSelectionHandlerRef = useRef<(() => void) | null>(null);
  const copyEventHandlerRef = useRef<((event: ClipboardEvent) => void) | null>(null);
  const activeSessionBindingRef = useRef<ReturnType<
    typeof createXtermSessionBindingSnapshot
  > | null>(null);
  const deadRecoveryAttemptKeyRef = useRef<string | null>(null);
  const isUnmountedRef = useRef(false);
  const initAttemptIdRef = useRef(0);
  const containerReadyCleanupRef = useRef<(() => void) | null>(null);
  const createRequestIdRef = useRef(0);
  const appliedStaticContentKeyRef = useRef<string | null>(null);
  const agentStartupLoggerRef = useRef<ReturnType<typeof createAgentStartupTimelineLogger> | null>(
    null
  );
  const agentStartupFirstOutputLoggedRef = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onReplaySnapshotChangeRef = useRef(onReplaySnapshotChange);
  onReplaySnapshotChangeRef.current = onReplaySnapshotChange;
  const onCustomKeyRef = useRef(onCustomKey);
  onCustomKeyRef.current = onCustomKey;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onInitRef = useRef(onInit);
  onInitRef.current = onInit;
  const onSessionIdChangeRef = useRef(onSessionIdChange);
  onSessionIdChangeRef.current = onSessionIdChange;
  const onSessionOpenRef = useRef(onSessionOpen);
  onSessionOpenRef.current = onSessionOpen;
  const onHostScrollbackStateChangeRef = useRef(onHostScrollbackStateChange);
  onHostScrollbackStateChangeRef.current = onHostScrollbackStateChange;
  const onSplitRef = useRef(onSplit);
  onSplitRef.current = onSplit;
  const onMergeRef = useRef(onMerge);
  onMergeRef.current = onMerge;
  const canMergeRef = useRef(canMerge);
  canMergeRef.current = canMerge;
  const copyOnSelectionRef = useRef(copyOnSelection);
  copyOnSelectionRef.current = copyOnSelection;
  const hasBeenActivatedRef = useRef(false);
  const hasReceivedDataRef = useRef(false);
  const firstOutputWaitersRef = useRef(new Set<() => void>());
  const staticContentRef = useRef(staticContent);
  staticContentRef.current = staticContent;
  const isStaticContentModeRef = useRef(Boolean(staticContent));
  isStaticContentModeRef.current = Boolean(staticContent);
  const [isLoading, setIsLoading] = useState(false);
  const [runtimeState, setRuntimeState] = useState<SessionRuntimeState>('live');
  const [wheelHandlerAttachmentEpoch, setWheelHandlerAttachmentEpoch] = useState(0);
  const [searchState, setSearchState] = useState<TerminalSearchState>(
    createEmptyTerminalSearchState()
  );
  const runtimeStateRef = useRef<SessionRuntimeState>('live');
  runtimeStateRef.current = runtimeState;
  const initialCommandRef = useRef(initialCommand);
  initialCommandRef.current = initialCommand;
  // Track if this terminal should respond to global shortcuts
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const shouldSyncVisibleLayout = isActive || isVisible;
  const shouldActivateFromVisibleSurface = isActive || isVisible;
  const shouldActivateFromInitialCommand =
    activateOnInitialCommandWhenInactive && Boolean(initialCommand);
  // Memoize command key to avoid dependency array issues
  const commandKey = useMemo(
    () =>
      command
        ? `${command.shell}:${command.args.join(' ')}`
        : `shellConfig:${JSON.stringify(shellConfig)}:initialCommand:${initialCommand || ''}`,
    [command, shellConfig, initialCommand]
  );
  const staticContentKey = useMemo(
    () => staticContent?.identity ?? staticContent?.text ?? '',
    [staticContent]
  );
  const desiredSessionBinding = useMemo(
    () =>
      createXtermSessionBindingSnapshot({
        cwd: cwd || getRendererEnvironment().HOME,
        kind,
        persistOnDisconnect,
        sessionId: staticContent ? `static:${staticContentKey}` : backendSessionId,
      }),
    [backendSessionId, cwd, kind, persistOnDisconnect, staticContent, staticContentKey]
  );
  // rAF write buffer for smooth rendering
  const writeBufferRef = useRef('');
  const isFlushPendingRef = useRef(false);
  const dataFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelCarryRef = useRef(0);
  const pendingHostScrollRef = useRef<PendingHostScrollRequest | null>(null);
  const hostScrollFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDecorations = useMemo(
    () => buildTerminalSearchDecorations(settings.theme),
    [settings.theme]
  );
  const replaySnapshotRef = useRef(recoveredReplaySnapshot ?? '');
  const replaySnapshotFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildSearchOptions = useCallback(
    (options?: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
    }): InternalTerminalSearchOptions => ({
      ...options,
      decorations: searchDecorations,
    }),
    [searchDecorations]
  );

  useEffect(() => {
    if (hasReceivedDataRef.current) {
      return;
    }

    replaySnapshotRef.current = recoveredReplaySnapshot ?? '';
  }, [recoveredReplaySnapshot]);

  const write = useCallback((data: string) => {
    if (ptyIdRef.current && runtimeStateRef.current === 'live') {
      window.electronAPI.session.write(ptyIdRef.current, data);
    }
  }, []);

  const flushReplaySnapshot = useCallback((immediate = false) => {
    const emit = () => {
      replaySnapshotFlushTimerRef.current = null;
      const nextSnapshot = replaySnapshotRef.current;
      if (!onReplaySnapshotChangeRef.current) {
        return;
      }
      onReplaySnapshotChangeRef.current(
        nextSnapshot || undefined,
        nextSnapshot ? Date.now() : undefined
      );
    };

    if (immediate) {
      if (replaySnapshotFlushTimerRef.current) {
        clearTimeout(replaySnapshotFlushTimerRef.current);
      }
      emit();
      return;
    }

    if (replaySnapshotFlushTimerRef.current) {
      return;
    }

    replaySnapshotFlushTimerRef.current = setTimeout(emit, 150);
  }, []);

  const replaceReplaySnapshot = useCallback(
    (nextSnapshot: string | undefined) => {
      const normalized = nextSnapshot ? appendPersistentAgentReplaySnapshot('', nextSnapshot) : '';
      if (normalized === replaySnapshotRef.current) {
        return;
      }
      replaySnapshotRef.current = normalized;
      flushReplaySnapshot();
    },
    [flushReplaySnapshot]
  );

  const appendReplaySnapshot = useCallback(
    (chunk: string) => {
      if (!chunk) {
        return;
      }

      const nextSnapshot = appendPersistentAgentReplaySnapshot(replaySnapshotRef.current, chunk);
      if (nextSnapshot === replaySnapshotRef.current) {
        return;
      }

      replaySnapshotRef.current = nextSnapshot;
      flushReplaySnapshot();
    },
    [flushReplaySnapshot]
  );

  const syncViewportToSession = useCallback(() => {
    return syncXtermViewportToSession({
      fitViewport: () => {
        fitAddonRef.current?.fit();
      },
      measureViewport: () => {
        const fitAddon = fitAddonRef.current;
        const terminal = terminalRef.current;

        if (!fitAddon || !terminal) {
          return null;
        }

        return {
          cols: terminal.cols,
          rows: terminal.rows,
        };
      },
      resizeSession: (sessionId, size) => {
        void window.electronAPI.session.resize(sessionId, size).catch((error) => {
          console.warn('[xterm] Failed to resize session viewport', {
            sessionId,
            error,
          });
        });
      },
      runtimeState: runtimeStateRef.current,
      sessionId: ptyIdRef.current,
    });
  }, []);

  const fitTerminal = useCallback(() => {
    syncViewportToSession();
  }, [syncViewportToSession]);

  const findNext = useCallback(
    (
      term: string,
      options?: {
        caseSensitive?: boolean;
        wholeWord?: boolean;
        regex?: boolean;
      }
    ) => {
      return searchAddonRef.current?.findNext(term, buildSearchOptions(options)) ?? false;
    },
    [buildSearchOptions]
  );

  const findPrevious = useCallback(
    (
      term: string,
      options?: {
        caseSensitive?: boolean;
        wholeWord?: boolean;
        regex?: boolean;
      }
    ) => {
      return searchAddonRef.current?.findPrevious(term, buildSearchOptions(options)) ?? false;
    },
    [buildSearchOptions]
  );

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations();
    setSearchState(createEmptyTerminalSearchState());
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const refreshRenderer = useCallback(() => {
    if (!terminalRef.current) return;
    const addon = rendererAddonRef.current;
    if (addon && 'clearTextureAtlas' in addon) {
      try {
        (addon as WebglAddon).clearTextureAtlas();
      } catch {
        // Ignore
      }
    }
    terminalRef.current.refresh(0, terminalRef.current.rows - 1);
  }, []);

  const loadRenderer = useCallback((terminal: Terminal, renderer: typeof terminalRenderer) => {
    // Dispose current renderer addon
    rendererAddonRef.current?.dispose();
    rendererAddonRef.current = null;

    // Load renderer based on settings (webgl > canvas > dom)
    if (renderer === 'webgl') {
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          // Guard against disposed terminal
          if (terminalRef.current && rendererAddonRef.current === webglAddon) {
            console.warn('[xterm] WebGL context lost, falling back to DOM renderer');
            webglAddon.dispose();
            rendererAddonRef.current = null;
          }
        });
        terminal.loadAddon(webglAddon);
        rendererAddonRef.current = webglAddon;
      } catch (error) {
        console.warn('[xterm] WebGL failed, falling back to DOM renderer:', error);
        rendererAddonRef.current = null;
      }
    }
    // 'dom' or 'canvas' uses the default DOM renderer, no addon needed
    // Note: 'canvas' support is removed in favor of DOM as legacy fallback

    // Trigger refresh to ensure render
    terminal.refresh(0, terminal.rows - 1);
  }, []);

  const clearTerminalWriteFlushTimers = useCallback(() => {
    if (dataFlushTimerRef.current) {
      clearTimeout(dataFlushTimerRef.current);
      dataFlushTimerRef.current = null;
    }
    if (exitFlushTimerRef.current) {
      clearTimeout(exitFlushTimerRef.current);
      exitFlushTimerRef.current = null;
    }
    writeBufferRef.current = '';
    isFlushPendingRef.current = false;
  }, []);

  const flushPendingHostScroll = useCallback(() => {
    if (hostScrollFlushTimerRef.current) {
      clearTimeout(hostScrollFlushTimerRef.current);
      hostScrollFlushTimerRef.current = null;
    }

    const request = pendingHostScrollRef.current;
    pendingHostScrollRef.current = null;
    if (!request || request.amount <= 0) {
      return;
    }

    void window.electronAPI.tmux
      .scrollClient(request.cwd, {
        sessionName: request.sessionName,
        serverName: request.serverName,
        direction: request.direction,
        amount: request.amount,
      })
      .then((result) => {
        const nextHostScrollbackState =
          typeof result.inMode === 'boolean'
            ? result.inMode
            : request.direction === 'up' && result.applied;
        onHostScrollbackStateChangeRef.current?.(nextHostScrollbackState);
      })
      .catch(() => {
        onHostScrollbackStateChangeRef.current?.(false);
      });
  }, []);

  const clearPendingHostScroll = useCallback(() => {
    if (hostScrollFlushTimerRef.current) {
      clearTimeout(hostScrollFlushTimerRef.current);
      hostScrollFlushTimerRef.current = null;
    }
    pendingHostScrollRef.current = null;
  }, []);

  const scheduleHostScroll = useCallback(
    (request: PendingHostScrollRequest) => {
      if (request.amount <= 0) {
        return;
      }

      const pending = pendingHostScrollRef.current;
      if (
        pending &&
        pending.cwd === request.cwd &&
        pending.sessionName === request.sessionName &&
        pending.serverName === request.serverName &&
        pending.direction === request.direction
      ) {
        pendingHostScrollRef.current = {
          ...pending,
          amount: pending.amount + request.amount,
        };
      } else {
        if (pending) {
          flushPendingHostScroll();
        }
        pendingHostScrollRef.current = request;
      }

      if (!hostScrollFlushTimerRef.current) {
        hostScrollFlushTimerRef.current = setTimeout(
          flushPendingHostScroll,
          HOST_SCROLL_FLUSH_DELAY_MS
        );
      }
    },
    [flushPendingHostScroll]
  );

  const resetSessionBinding = useCallback(
    async (terminal: Terminal, clearTerminal: boolean) => {
      createRequestIdRef.current += 1;
      activeSessionBindingRef.current = null;
      deadRecoveryAttemptKeyRef.current = null;
      hasReceivedDataRef.current = false;
      firstOutputWaitersRef.current.clear();
      wheelCarryRef.current = 0;
      clearPendingHostScroll();
      onHostScrollbackStateChangeRef.current?.(false);
      setSearchState(createEmptyTerminalSearchState());
      sessionEventsCleanupRef.current?.();
      sessionEventsCleanupRef.current = null;
      clearTerminalWriteFlushTimers();
      setRuntimeState('live');

      const currentSessionId = ptyIdRef.current;
      ptyIdRef.current = null;
      if (currentSessionId) {
        await window.electronAPI.session.detach(currentSessionId).catch(() => {});
      }

      if (clearTerminal) {
        terminal.reset();
      }
    },
    [clearPendingHostScroll, clearTerminalWriteFlushTimers]
  );

  const handleTerminalWheelEvent = useCallback(
    (event: WheelEvent) => {
      const terminal = terminalRef.current;
      if (!terminal) {
        return true;
      }

      const decision = resolveAgentWheelPolicy({
        kind,
        activeBufferType: terminal.buffer.active.type,
        mouseTrackingMode: terminal.modes.mouseTrackingMode,
        hostScrollMode:
          preferHostScrollback && hostSession?.kind === 'tmux' ? hostSession.kind : undefined,
        deltaMode: event.deltaMode,
        deltaY: event.deltaY,
        carryY: wheelCarryRef.current,
        cellHeightPx: terminal.dimensions?.device.cell.height,
        devicePixelRatio: window.devicePixelRatio || 1,
      });

      wheelCarryRef.current = decision.carryY;
      if (decision.action === 'delegate') {
        return true;
      }

      if (decision.action === 'host-scroll') {
        if (hostSession?.kind === 'tmux' && decision.scrollLines !== 0) {
          scheduleHostScroll({
            cwd,
            sessionName: hostSession.sessionName,
            serverName: hostSession.serverName,
            direction: decision.scrollLines < 0 ? 'up' : 'down',
            amount: Math.abs(decision.scrollLines),
          });
        }
        event.preventDefault();
        event.stopPropagation();
        return false;
      }

      if (typeof decision.scrollLines === 'number') {
        if (decision.scrollLines !== 0) {
          terminal.scrollLines(decision.scrollLines);
        }
        event.preventDefault();
        event.stopPropagation();
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      return false;
    },
    [cwd, hostSession, kind, preferHostScrollback, scheduleHostScroll]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: settings excluded - updated via separate effect
  const initTerminal = useCallback(async () => {
    if (!containerRef.current && !terminalRef.current) return;

    const initAttemptId = ++initAttemptIdRef.current;
    containerReadyCleanupRef.current?.();
    containerReadyCleanupRef.current = null;
    setIsLoading(true);
    if (!staticContent && kind === 'agent') {
      agentStartupFirstOutputLoggedRef.current = false;
      agentStartupLoggerRef.current = createAgentStartupTimelineLogger({
        source: 'renderer',
        getLabel: () => ptyIdRef.current ?? backendSessionId ?? command?.shell ?? 'pending',
        log: (message) => recordAgentStartup(message),
      });
      agentStartupLoggerRef.current.markStage('init-terminal-start');
    } else {
      agentStartupLoggerRef.current = null;
    }

    let terminal = terminalRef.current;

    if (!terminal) {
      const initialContainer = containerRef.current;
      if (!initialContainer) {
        setIsLoading(false);
        return;
      }

      if (!isXtermContainerReady(initialContainer)) {
        await new Promise<void>((resolve) => {
          containerReadyCleanupRef.current?.();
          containerReadyCleanupRef.current = scheduleXtermContainerReady({
            container: initialContainer,
            onReady: resolve,
            requestAnimationFrame: window.requestAnimationFrame.bind(window),
            cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
          });
        });
        containerReadyCleanupRef.current = null;

        if (isUnmountedRef.current || initAttemptId !== initAttemptIdRef.current) {
          setIsLoading(false);
          return;
        }
      }

      const container = containerRef.current;
      if (!container || !isXtermContainerReady(container)) {
        setIsLoading(false);
        return;
      }

      const nextTerminal = new Terminal(
        buildXtermTerminalOptions({
          platform: getRendererEnvironment().platform,
          settings,
        })
      );
      terminal = nextTerminal;
      transcriptModeCleanupRef.current?.dispose();
      transcriptModeCleanupRef.current = attachAgentTranscriptMode(nextTerminal, kind);

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      const webLinksAddon = new WebLinksAddon((_event, uri) => {
        window.electronAPI.shell.openExternal(uri);
      });
      const unicode11Addon = new Unicode11Addon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(searchAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.loadAddon(unicode11Addon);
      terminal.unicode.activeVersion = '11';

      terminal.open(container);
      fitAddon.fit();

      terminal.onTitleChange((title) => {
        onTitleChangeRef.current?.(title);
      });

      loadRenderer(terminal, effectiveTerminalRenderer);

      const linkProviderDisposable = terminal.registerLinkProvider({
        provideLinks: (bufferLineNumber, callback) => {
          const currentTerminal = terminalRef.current;
          if (!currentTerminal) {
            callback(undefined);
            return;
          }
          const line = currentTerminal.buffer.active.getLine(bufferLineNumber - 1);
          if (!line) {
            callback(undefined);
            return;
          }

          const lineText = line.translateToString();
          const links: Array<{
            range: {
              start: { x: number; y: number };
              end: { x: number; y: number };
            };
            text: string;
            activate: () => void;
          }> = [];

          FILE_PATH_REGEX.lastIndex = 0;

          while (true) {
            const match = FILE_PATH_REGEX.exec(lineText);
            if (match === null) {
              break;
            }

            const fullMatch = match[0];
            const filePath = match[1];
            const lineNum = match[2] ? Number.parseInt(match[2], 10) : undefined;
            const colNum = match[3] ? Number.parseInt(match[3], 10) : undefined;
            const startIndex =
              match.index +
              (fullMatch.length -
                filePath.length -
                (match[2] ? `:${match[2]}`.length : 0) -
                (match[3] ? `:${match[3]}`.length : 0));
            const endIndex = match.index + fullMatch.length;

            links.push({
              range: {
                start: { x: startIndex + 1, y: bufferLineNumber },
                end: { x: endIndex + 1, y: bufferLineNumber },
              },
              text: fullMatch.trim(),
              activate: async () => {
                const basePath = cwdRef.current || '';
                let absolutePath = filePath.startsWith('/')
                  ? filePath
                  : `${basePath}/${filePath}`.replace(/\/\.\//g, '/');

                let exists = await window.electronAPI.file.exists(absolutePath);
                if (!exists && !filePath.includes('/')) {
                  try {
                    const results = await window.electronAPI.search.files({
                      query: filePath,
                      rootPath: basePath,
                      maxResults: 1,
                    });
                    if (results?.length > 0) {
                      absolutePath = results[0].path;
                      exists = true;
                    }
                  } catch (error) {
                    console.warn(`Failed to search for file: ${filePath}`, error);
                  }
                }

                if (!exists) return;

                const isMarkdown = absolutePath.toLowerCase().endsWith('.md');
                navigateToFile({
                  path: absolutePath,
                  line: lineNum,
                  column: colNum,
                  previewMode: isMarkdown ? 'fullscreen' : undefined,
                });
              },
            });
          }

          callback(links.length > 0 ? links : undefined);
        },
      });
      linkProviderDisposableRef.current = linkProviderDisposable;

      const handleCopyOnSelection = () => {
        if (!copyOnSelectionRef.current) return;
        setTimeout(() => {
          const currentTerminal = terminalRef.current;
          if (!currentTerminal) return;
          void copyTerminalSelectionToClipboard(currentTerminal).finally(() => {
            restoreTerminalInteractionAfterCopy(currentTerminal);
          });
        }, 0);
      };
      const handleCopyEvent = (event: ClipboardEvent) => {
        const currentTerminal = terminalRef.current;
        const selectionText = getTerminalSelectionText(currentTerminal);
        if (
          !shouldHandleTerminalCopyEvent({
            container,
            eventTarget: event.target,
            activeElement: document.activeElement,
            domSelectionText: document.getSelection()?.toString() ?? '',
            selectionText,
          })
        ) {
          return;
        }
        if (!selectionText) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.clipboardData?.setData('text/plain', selectionText);
        void writeClipboardText(selectionText).finally(() => {
          restoreTerminalInteractionAfterCopy(currentTerminal);
        });
      };

      terminal.element?.addEventListener('mouseup', handleCopyOnSelection);
      window.addEventListener('copy', handleCopyEvent);
      copyOnSelectionHandlerRef.current = handleCopyOnSelection;
      copyEventHandlerRef.current = handleCopyEvent;

      terminalInputCleanupRef.current = terminal.onData((data) => {
        if (ptyIdRef.current && runtimeStateRef.current === 'live') {
          window.electronAPI.session.write(ptyIdRef.current, data);
        }
      });

      searchAddon.onDidChangeResults((result: InternalTerminalSearchResultChange) => {
        setSearchState(createTerminalSearchState(result));
      });

      terminalRef.current = terminal;
      if ((window as InfiluxE2ETerminalWindow).__INFILUX_E2E_ENABLE__ === true) {
        (window as InfiluxE2ETerminalWindow).__INFILUX_E2E_LAST_XTERM__ = terminal;
      }
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;
      setWheelHandlerAttachmentEpoch((current) => current + 1);
    } else {
      await resetSessionBinding(terminal, true);
      setWheelHandlerAttachmentEpoch((current) => current + 1);
    }

    // Custom key handler
    terminal.attachCustomKeyEventHandler((event) => {
      // Let IME composition events pass through so composed input is not interrupted.
      if (event.isComposing || event.keyCode === 229) {
        return true;
      }

      // Only respond to tab/clear shortcuts when this terminal is active
      const shouldHandleShortcuts = isActiveRef.current;
      if (
        matchesKeybinding(event, settings.xtermKeybindings.newTab) ||
        matchesKeybinding(event, settings.xtermKeybindings.closeTab) ||
        matchesKeybinding(event, settings.xtermKeybindings.nextTab) ||
        matchesKeybinding(event, settings.xtermKeybindings.prevTab)
      ) {
        return false;
      }
      // Handle clear directly here, only when active
      if (shouldHandleShortcuts && matchesKeybinding(event, settings.xtermKeybindings.clear)) {
        if (event.type === 'keydown') {
          terminal.clear();
        }
        return false;
      }
      if (event.type === 'keydown') {
        if (matchesKeybinding(event, settings.xtermKeybindings.split)) {
          onSplitRef.current?.();
          return false;
        }
        if (canMergeRef.current && matchesKeybinding(event, settings.xtermKeybindings.merge)) {
          onMergeRef.current?.();
          return false;
        }
      }
      // Cmd/Ctrl+1-9 or Option+1-9: let global shortcuts handle panel/tab switching
      // Use event.code for keyboard layout independence (Option+1 may produce special chars)
      const isDigit1to9 = event.code >= 'Digit1' && event.code <= 'Digit9';
      if (isDigit1to9) {
        const hasModifier =
          ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) ||
          (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey);
        if (hasModifier) {
          return false;
        }
      }

      // Handle copy - paste is NOT intercepted to allow image paste in agents
      const platform = getRendererEnvironment().platform;
      const isMac = platform === 'darwin';
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      if (isStaticContentModeRef.current) {
        if (event.type === 'keydown' && modKey && !event.altKey) {
          if (event.key === 'c' || event.key === 'C') {
            if (getTerminalSelectionText(terminal)) {
              void copyTerminalSelectionToClipboard(terminal).finally(() => {
                restoreTerminalInteractionAfterCopy(terminal);
              });
              return false;
            }
            if (!isMac) {
              return true;
            }
            return false;
          }
        }

        return true;
      }

      if (event.type === 'keydown' && modKey && !event.altKey) {
        // Paste: DO NOT intercept - let browser/agent handle it naturally
        // This allows Claude Code and other agents to receive image paste events
        if (event.key === 'v' || event.key === 'V') {
          return false; // Let event bubble up
        }

        // Copy: Cmd+C (mac) or Ctrl+C (win/linux)
        if (event.key === 'c' || event.key === 'C') {
          if (getTerminalSelectionText(terminal)) {
            void copyTerminalSelectionToClipboard(terminal).finally(() => {
              restoreTerminalInteractionAfterCopy(terminal);
            });
            return false;
          }
          // On Windows/Linux, let Ctrl+C pass through as SIGINT when no selection
          if (!isMac) return true;
          return false;
        }
      }

      // macOS-style navigation shortcuts (only on keydown to avoid double-firing)
      if (event.type === 'keydown' && ptyIdRef.current && runtimeStateRef.current === 'live') {
        // Cmd+Left: jump to line start (Ctrl+A)
        if (event.metaKey && !event.altKey && event.key === 'ArrowLeft') {
          write('\x01');
          return false;
        }
        // Cmd+Right: jump to line end (Ctrl+E)
        if (event.metaKey && !event.altKey && event.key === 'ArrowRight') {
          write('\x05');
          return false;
        }
        // Option+Left: jump word backward (ESC+b)
        if (event.altKey && !event.metaKey && event.key === 'ArrowLeft') {
          write('\x1bb');
          return false;
        }
        // Option+Right: jump word forward (ESC+f)
        if (event.altKey && !event.metaKey && event.key === 'ArrowRight') {
          write('\x1bf');
          return false;
        }
        // Option+Backspace: delete word backward (Ctrl+W)
        if (event.altKey && !event.metaKey && event.key === 'Backspace') {
          write('\x17');
          return false;
        }
        // Cmd+Backspace: delete to line start (Ctrl+U)
        if (event.metaKey && !event.altKey && event.key === 'Backspace') {
          write('\x15');
          return false;
        }
      }

      if (ptyIdRef.current && onCustomKeyRef.current) {
        const getCurrentLine = (): string | null => {
          const term = terminalRef.current;
          if (!term) return null;
          const buf = term.buffer.active;
          // Use absolute row (baseY + cursorY) to handle scrolled-back buffers
          const y = buf.baseY + buf.cursorY;
          const line = buf.getLine(y);
          if (!line) return null;
          const raw = line.translateToString();
          const stripped = raw.replace(ANSI_ESCAPE_REGEX, '');
          const trimmed = stripped.trim();
          if (!trimmed) return null;
          return trimmed.length > SESSION_NAME_MAX_LENGTH
            ? `${trimmed.slice(0, SESSION_NAME_MAX_LENGTH)}…`
            : trimmed;
        };
        return onCustomKeyRef.current(event, ptyIdRef.current, getCurrentLine);
      }
      return true;
    });

    terminal.options.disableStdin = Boolean(staticContentRef.current);

    if (staticContentRef.current) {
      hasReceivedDataRef.current = staticContentRef.current.text.length > 0;
      activeSessionBindingRef.current = createXtermSessionBindingSnapshot({
        cwd: cwd || getRendererEnvironment().HOME,
        kind,
        persistOnDisconnect,
        sessionId: `static:${staticContentKey}`,
      });
      deadRecoveryAttemptKeyRef.current = null;
      setRuntimeState('live');
      setIsLoading(false);

      if (staticContentRef.current.text) {
        terminal.write(staticContentRef.current.text);
      }
      appliedStaticContentKeyRef.current = staticContentKey;

      return;
    }

    try {
      const createRequestId = ++createRequestIdRef.current;
      const baseCwd = cwd || getRendererEnvironment().HOME;
      const hasOwnOverride = <K extends keyof XtermSessionCreateFallbackOptions>(
        overrides: XtermSessionCreateFallbackOptions | undefined,
        key: K
      ): overrides is XtermSessionCreateFallbackOptions &
        Required<Pick<XtermSessionCreateFallbackOptions, K>> =>
        Boolean(overrides && Object.hasOwn(overrides, key));
      const buildCreateOptions = (
        overrides?: XtermSessionCreateFallbackOptions
      ): SessionCreateOptions => {
        const nextCommand = hasOwnOverride(overrides, 'command') ? overrides.command : command;
        const nextEnv = hasOwnOverride(overrides, 'env') ? overrides.env : env;
        const nextHostSession = hasOwnOverride(overrides, 'hostSession')
          ? overrides.hostSession
          : hostSession;
        const nextInitialCommand = hasOwnOverride(overrides, 'initialCommand')
          ? overrides.initialCommand
          : initialCommandRef.current;

        return {
          cwd: baseCwd,
          ...(nextCommand
            ? {
                shell: nextCommand.shell,
                args: nextCommand.args,
                fallbackShell: nextCommand.fallbackCommand?.shell,
                fallbackArgs: nextCommand.fallbackCommand?.args,
              }
            : { shellConfig }),
          cols: terminal.cols,
          rows: terminal.rows,
          env: nextEnv,
          hostSession: nextHostSession,
          metadata,
          initialCommand: nextInitialCommand,
          kind,
          persistOnDisconnect,
        };
      };
      const createOptions = buildCreateOptions();

      const setCurrentSessionId = (sessionId: string) => {
        ptyIdRef.current = sessionId;
        setRuntimeState('live');
        onInitRef.current?.(sessionId);
        onSessionIdChangeRef.current?.(sessionId);
      };

      const subscribeToSession = (sessionId: string) => {
        sessionEventsCleanupRef.current?.();
        sessionEventsCleanupRef.current = window.electronAPI.session.subscribe(sessionId, {
          onData: (event) => {
            const isFirstOutputChunk = !hasReceivedDataRef.current;
            hasReceivedDataRef.current = true;
            if (isFirstOutputChunk) {
              const waiters = Array.from(firstOutputWaitersRef.current);
              firstOutputWaitersRef.current.clear();
              for (const resolve of waiters) {
                resolve();
              }
              setIsLoading(false);
            }
            if (
              shouldRearmDeadSessionRecovery({
                hasReceivedData: hasReceivedDataRef.current,
              })
            ) {
              deadRecoveryAttemptKeyRef.current = null;
            }
            if (!agentStartupFirstOutputLoggedRef.current) {
              agentStartupFirstOutputLoggedRef.current = true;
              agentStartupLoggerRef.current?.markStage('first-output');
            }
            writeBufferRef.current += event.data;
            appendReplaySnapshot(event.data);

            if (!isFlushPendingRef.current) {
              isFlushPendingRef.current = true;
              dataFlushTimerRef.current = setTimeout(() => {
                dataFlushTimerRef.current = null;
                if (writeBufferRef.current.length > 0) {
                  const bufferedData = writeBufferRef.current;
                  terminal.write(bufferedData);
                  onDataRef.current?.(bufferedData);
                  writeBufferRef.current = '';
                }
                isFlushPendingRef.current = false;
              }, 30);
            }
          },
          onExit: () => {
            setRuntimeState('dead');
            flushReplaySnapshot(true);
            exitFlushTimerRef.current = setTimeout(() => {
              exitFlushTimerRef.current = null;
              if (writeBufferRef.current.length > 0) {
                const bufferedData = writeBufferRef.current;
                terminal.write(bufferedData);
                onDataRef.current?.(bufferedData);
                writeBufferRef.current = '';
              }
              onExitRef.current?.();
            }, 30);
          },
          onState: (event) => {
            setRuntimeState(event.state);
          },
        });
      };

      const createFirstSessionOutputWaiter = () => {
        if (hasReceivedDataRef.current) {
          return {
            promise: Promise.resolve(),
            dispose: () => undefined,
          };
        }

        let disposed = false;
        let resolveWaiter: (() => void) | null = null;
        const promise = new Promise<void>((resolve) => {
          const waiter = () => {
            if (disposed) {
              return;
            }
            disposed = true;
            firstOutputWaitersRef.current.delete(waiter);
            resolve();
          };
          resolveWaiter = waiter;
          firstOutputWaitersRef.current.add(waiter);
        });

        return {
          promise,
          dispose: () => {
            if (disposed || !resolveWaiter) {
              return;
            }
            disposed = true;
            firstOutputWaitersRef.current.delete(resolveWaiter);
          },
        };
      };

      const attachToSession = (sessionId: string) => {
        agentStartupLoggerRef.current?.markStage('session-attach-start');
        return window.electronAPI.session.attach({
          sessionId,
          cwd: createOptions.cwd,
        });
      };

      const createAndAttachSessionWithOptions = async (
        sessionCreateOptions: SessionCreateOptions,
        stagePrefix: 'session-create' | 'session-create-fallback'
      ) => {
        agentStartupLoggerRef.current?.markStage(`${stagePrefix}-start`);
        const created = await window.electronAPI.session.create(sessionCreateOptions);
        agentStartupLoggerRef.current?.markStage(`${stagePrefix}-created`);
        const createdSessionId = created.session.sessionId;
        setCurrentSessionId(createdSessionId);
        subscribeToSession(createdSessionId);
        if (isRemoteVirtualPath(sessionCreateOptions.cwd ?? '')) {
          return created;
        }
        const attachPromise = attachToSession(createdSessionId);
        const firstOutputWaiter = createFirstSessionOutputWaiter();
        const attached = await Promise.race([
          attachPromise.then((result) => ({
            type: 'attached' as const,
            result,
          })),
          firstOutputWaiter.promise.then(() => ({
            type: 'first-output' as const,
          })),
        ]).finally(() => {
          firstOutputWaiter.dispose();
        });
        if (attached.type === 'first-output') {
          agentStartupLoggerRef.current?.markStage(`${stagePrefix}-attach-bypassed-on-output`);
          return created;
        }
        agentStartupLoggerRef.current?.markStage(`${stagePrefix}-attached`);
        return attached.result;
      };

      const createAndAttachSession = async () => {
        try {
          return await createAndAttachSessionWithOptions(createOptions, 'session-create');
        } catch (error) {
          if (
            !shouldRetrySessionCreateWithoutHost({
              error,
              kind,
              persistOnDisconnect,
              hostSession,
              hasFallback: Boolean(sessionCreateFallback),
            })
          ) {
            throw error;
          }

          sessionCreateFallback?.onRetry?.();
          return createAndAttachSessionWithOptions(
            buildCreateOptions(sessionCreateFallback),
            'session-create-fallback'
          );
        }
      };

      let session: SessionDescriptor | null = null;
      let replay: string | undefined;
      let reusedExistingSession = false;
      const reusableBackendSessionId = await resolveReusableBackendSessionId({
        backendSessionId,
        cwd: createOptions.cwd,
        getRemoteStatus: (connectionId) => window.electronAPI.remote.getStatus(connectionId),
        getLocalRuntimeInfo: (sessionId) => window.electronAPI.session.getRuntimeInfo(sessionId),
        allowUntrackedLocalAttach:
          kind === 'agent' && persistOnDisconnect && getRendererEnvironment().platform === 'win32',
      });

      if (reusableBackendSessionId) {
        try {
          setCurrentSessionId(reusableBackendSessionId);
          subscribeToSession(reusableBackendSessionId);
          const result = await attachToSession(reusableBackendSessionId);
          agentStartupLoggerRef.current?.markStage('session-attached');
          session = result.session;
          replay = result.replay;
          reusedExistingSession = true;
        } catch (error) {
          agentStartupLoggerRef.current?.markStage('attach-existing-failed');
          console.warn('[xterm] Failed to attach existing session, creating a new one:', error);
          sessionEventsCleanupRef.current?.();
          sessionEventsCleanupRef.current = null;
          ptyIdRef.current = null;
        }
      }

      if (!session) {
        const attached = await createAndAttachSession();
        session = attached.session;
        replay = attached.replay;
      }

      if (!session) {
        throw new Error('Failed to initialize terminal session');
      }

      if (isUnmountedRef.current || createRequestId !== createRequestIdRef.current) {
        sessionEventsCleanupRef.current?.();
        sessionEventsCleanupRef.current = null;
        ptyIdRef.current = null;
        await window.electronAPI.session.kill(session.sessionId).catch(() => {});
        return;
      }

      onSessionOpenRef.current?.(session);

      if (ptyIdRef.current !== session.sessionId) {
        setCurrentSessionId(session.sessionId);
        subscribeToSession(session.sessionId);
      }
      activeSessionBindingRef.current = createXtermSessionBindingSnapshot({
        cwd: baseCwd,
        kind,
        persistOnDisconnect,
        sessionId: session.sessionId,
      });
      deadRecoveryAttemptKeyRef.current = null;
      setIsLoading(false);

      const initialReplay = resolveRecoveredInitialTerminalReplay({
        attachedReplay: replay,
        persistedReplaySnapshot: recoveredReplaySnapshot,
        reusedExistingSession,
      });
      const persistedReplaySnapshot = resolveRecoveredReplaySnapshotPersistence({
        attachedReplay: replay,
        reusedExistingSession,
      });
      replaceReplaySnapshot(persistedReplaySnapshot);
      const shouldApplyReplay = shouldApplyInitialTerminalReplay({
        initialReplay,
        hasReceivedData: hasReceivedDataRef.current,
        liveReplaySnapshot: replaySnapshotRef.current,
      });

      if (shouldApplyReplay && initialReplay) {
        hasReceivedDataRef.current = true;
        if (
          shouldRearmDeadSessionRecovery({
            hasReceivedData: hasReceivedDataRef.current,
            replay: initialReplay,
          })
        ) {
          deadRecoveryAttemptKeyRef.current = null;
        }
        terminal.write(initialReplay);
        onDataRef.current?.(initialReplay);
      }

      // Focus is handled by the isActive effect after loading ends.
    } catch (error) {
      agentStartupLoggerRef.current?.markStage('init-terminal-failed');
      sessionEventsCleanupRef.current?.();
      sessionEventsCleanupRef.current = null;
      ptyIdRef.current = null;
      if (isUnmountedRef.current) {
        return;
      }
      setIsLoading(false);
      terminal.writeln(`\x1b[31mFailed to start terminal.\x1b[0m`);
      terminal.writeln(`\x1b[33mError: ${error}\x1b[0m`);
    }
  }, [
    backendSessionId,
    cwd,
    command,
    shellConfig,
    commandKey,
    env,
    hostSession,
    metadata,
    effectiveTerminalRenderer,
    kind,
    persistOnDisconnect,
    sessionCreateFallback,
    recoveredReplaySnapshot,
    navigateToFile,
    loadRenderer,
    resetSessionBinding,
    appendReplaySnapshot,
    flushReplaySnapshot,
    replaceReplaySnapshot,
    staticContent,
    staticContentKey,
    write,
  ]);

  useEffect(() => {
    const shouldActivate =
      shouldActivateFromVisibleSurface ||
      shouldActivateFromInitialCommand ||
      Boolean(staticContent);
    if (shouldActivate && !hasBeenActivatedRef.current) {
      hasBeenActivatedRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          initTerminal();
        });
      });
    }
  }, [
    initTerminal,
    shouldActivateFromInitialCommand,
    shouldActivateFromVisibleSurface,
    staticContent,
  ]);

  useEffect(() => {
    if (staticContent) {
      return;
    }

    const shouldActivate = shouldActivateFromVisibleSurface || shouldActivateFromInitialCommand;
    if (!shouldActivate || !hasBeenActivatedRef.current || !terminalRef.current) {
      return;
    }

    if (!shouldRebindXtermSession(activeSessionBindingRef.current, desiredSessionBinding)) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void initTerminal();
      });
    });
  }, [
    desiredSessionBinding,
    initTerminal,
    shouldActivateFromInitialCommand,
    shouldActivateFromVisibleSurface,
    staticContent,
  ]);

  useEffect(() => {
    if (staticContent) {
      return;
    }

    const shouldActivate = shouldActivateFromVisibleSurface || shouldActivateFromInitialCommand;
    if (!shouldActivate || !hasBeenActivatedRef.current || !terminalRef.current) {
      return;
    }

    if (runtimeState !== 'dead') {
      return;
    }

    if (
      !shouldAttemptDeadSessionRecovery({
        allowDeadSessionRecovery: retryOnDeadSession,
        lastAttemptKey: deadRecoveryAttemptKeyRef.current,
        snapshot: desiredSessionBinding,
      })
    ) {
      return;
    }
    deadRecoveryAttemptKeyRef.current = buildXtermRecoveryAttemptKey(desiredSessionBinding);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void initTerminal();
      });
    });
  }, [
    desiredSessionBinding,
    initTerminal,
    retryOnDeadSession,
    runtimeState,
    shouldActivateFromInitialCommand,
    shouldActivateFromVisibleSurface,
    staticContent,
  ]);

  useEffect(() => {
    if (!staticContent) {
      appliedStaticContentKeyRef.current = null;
      return;
    }

    if (!hasBeenActivatedRef.current) {
      return;
    }

    const terminal = terminalRef.current;
    if (!terminal) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void initTerminal();
        });
      });
      return;
    }

    if (appliedStaticContentKeyRef.current === staticContentKey) {
      return;
    }

    searchAddonRef.current?.clearDecorations();
    setSearchState(createEmptyTerminalSearchState());
    writeBufferRef.current = '';
    isFlushPendingRef.current = false;
    terminal.reset();
    terminal.options.disableStdin = true;
    if (staticContent.text) {
      terminal.write(staticContent.text);
    }
    appliedStaticContentKeyRef.current = staticContentKey;

    requestAnimationFrame(() => {
      fitTerminal();
    });
  }, [fitTerminal, initTerminal, staticContent, staticContentKey]);

  useEffect(() => {
    if (wheelHandlerAttachmentEpoch === 0) {
      return;
    }

    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    // Re-attach after terminal creation and restored-session resets.
    attachPersistentCustomWheelEventHandler(terminal, handleTerminalWheelEvent);
  }, [wheelHandlerAttachmentEpoch, handleTerminalWheelEvent]);

  const restartSession = useCallback(() => {
    if (staticContent) {
      return;
    }

    deadRecoveryAttemptKeyRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void initTerminal();
      });
    });
  }, [initTerminal, staticContent]);

  // Handle dynamic renderer switching
  useEffect(() => {
    if (terminalRef.current) {
      loadRenderer(terminalRef.current, effectiveTerminalRenderer);
    }
  }, [effectiveTerminalRenderer, loadRenderer]);

  useEffect(() => {
    return () => {
      flushReplaySnapshot(true);
      if (replaySnapshotFlushTimerRef.current) {
        clearTimeout(replaySnapshotFlushTimerRef.current);
        replaySnapshotFlushTimerRef.current = null;
      }
    };
  }, [flushReplaySnapshot]);

  // Cleanup on unmount.
  // Setup: reset isUnmountedRef so StrictMode re-mount can re-initialize.
  // Cleanup: reset activation/data refs so the next mount gets consistent state;
  // clear ptyIdRef after destroy to avoid holding a destroyed PTY id.
  useEffect(() => {
    isUnmountedRef.current = false;

    return () => {
      isUnmountedRef.current = true;
      initAttemptIdRef.current += 1;
      containerReadyCleanupRef.current?.();
      containerReadyCleanupRef.current = null;
      hasBeenActivatedRef.current = false;
      hasReceivedDataRef.current = false;
      firstOutputWaitersRef.current.clear();
      createRequestIdRef.current += 1;
      appliedStaticContentKeyRef.current = null;
      activeSessionBindingRef.current = null;
      deadRecoveryAttemptKeyRef.current = null;
      wheelCarryRef.current = 0;
      clearPendingHostScroll();
      clearTerminalWriteFlushTimers();
      sessionEventsCleanupRef.current?.();
      sessionEventsCleanupRef.current = null;
      terminalInputCleanupRef.current?.dispose();
      terminalInputCleanupRef.current = null;
      transcriptModeCleanupRef.current?.dispose();
      transcriptModeCleanupRef.current = null;
      if (ptyIdRef.current) {
        window.electronAPI.session.detach(ptyIdRef.current).catch(() => {});
        ptyIdRef.current = null;
      }
      // Remove copy-on-selection listener before disposing terminal
      if (copyOnSelectionHandlerRef.current) {
        terminalRef.current?.element?.removeEventListener(
          'mouseup',
          copyOnSelectionHandlerRef.current
        );
        copyOnSelectionHandlerRef.current = null;
      }
      if (copyEventHandlerRef.current) {
        window.removeEventListener('copy', copyEventHandlerRef.current);
        copyEventHandlerRef.current = null;
      }
      // Dispose addons before terminal to prevent async callback errors
      linkProviderDisposableRef.current?.dispose();
      linkProviderDisposableRef.current = null;
      rendererAddonRef.current?.dispose();
      rendererAddonRef.current = null;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      if ((window as InfiluxE2ETerminalWindow).__INFILUX_E2E_ENABLE__ === true) {
        (window as InfiluxE2ETerminalWindow).__INFILUX_E2E_LAST_XTERM__ = undefined;
      }
    };
  }, [clearPendingHostScroll, clearTerminalWriteFlushTimers]);

  // Update settings dynamically
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = settings.theme;
      terminalRef.current.options.fontSize = settings.fontSize;
      terminalRef.current.options.fontFamily = settings.fontFamily;
      terminalRef.current.options.fontWeight = settings.fontWeight;
      terminalRef.current.options.fontWeightBold = settings.fontWeightBold;
      // Update transparency options dynamically
      terminalRef.current.options.allowTransparency = settings.backgroundImageEnabled;
      syncViewportToSession();
    }
  }, [settings, syncViewportToSession]);

  // Handle resize
  useEffect(() => {
    if (!shouldSyncVisibleLayout) {
      return;
    }

    const handleResize = () => {
      if (syncViewportToSession()) {
        // Clear WebGL texture atlas on resize to prevent glitches
        const addon = rendererAddonRef.current;
        if (addon && 'clearTextureAtlas' in addon) {
          try {
            (addon as WebglAddon).clearTextureAtlas();
          } catch {
            // Ignore if addon is disposed
          }
        }
      }
    };

    const debouncedResize = (() => {
      let timeout: ReturnType<typeof setTimeout>;
      return () => {
        clearTimeout(timeout);
        timeout = setTimeout(handleResize, 50);
      };
    })();

    const unsubscribeWindowResize = subscribeToXtermWindowResize(debouncedResize);

    const observer = new ResizeObserver(debouncedResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    const intersectionObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        debouncedResize();
      }
    });
    if (containerRef.current) {
      intersectionObserver.observe(containerRef.current);
    }

    return () => {
      unsubscribeWindowResize();
      observer.disconnect();
      intersectionObserver.disconnect();
    };
  }, [shouldSyncVisibleLayout, syncViewportToSession]);

  // Fit and focus when becoming active (only after loading completes)
  useEffect(() => {
    if (!isActive || !terminalRef.current || isLoading) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    let activationRefreshCleanup: (() => void) | null = null;
    const containerReadyCleanup = scheduleXtermContainerReady({
      container,
      onReady: () => {
        activationRefreshCleanup = scheduleXtermActivationRefresh({
          fitViewport: fitTerminal,
          refresh: refreshRenderer,
          focus: () => terminalRef.current?.focus(),
          requestAnimationFrame: window.requestAnimationFrame.bind(window),
          cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
        });
      },
      requestAnimationFrame: window.requestAnimationFrame.bind(window),
      cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    });

    return () => {
      containerReadyCleanup();
      activationRefreshCleanup?.();
    };
  }, [isActive, isLoading, fitTerminal, refreshRenderer]);

  // Visible canvas tiles can be restored without becoming focused, so refresh their renderer
  // explicitly after the host surface returns to a measurable layout.
  useEffect(() => {
    if (isActive || !isVisible || !terminalRef.current) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    let surfaceRefreshCleanup: (() => void) | null = null;
    const containerReadyCleanup = scheduleXtermContainerReady({
      container,
      onReady: () => {
        surfaceRefreshCleanup = scheduleXtermActivationRefresh({
          fitViewport: fitTerminal,
          refresh: refreshRenderer,
          focus: () => undefined,
          requestAnimationFrame: window.requestAnimationFrame.bind(window),
          cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
        });
      },
      requestAnimationFrame: window.requestAnimationFrame.bind(window),
      cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    });

    return () => {
      containerReadyCleanup();
      surfaceRefreshCleanup?.();
    };
  }, [isActive, isVisible, fitTerminal, refreshRenderer]);

  // Handle window visibility change to refresh terminal rendering
  useEffect(() => {
    if (!shouldSyncVisibleLayout) {
      return;
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && terminalRef.current) {
        requestAnimationFrame(() => {
          // Clear WebGL texture atlas when page becomes visible (GPU resources may have been reclaimed)
          const addon = rendererAddonRef.current;
          if (addon && 'clearTextureAtlas' in addon) {
            try {
              (addon as WebglAddon).clearTextureAtlas();
            } catch {
              // Ignore if addon is disposed
            }
          }
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
          fitTerminal();
        });
      }
    };

    return subscribeToXtermVisibilityChange(handleVisibilityChange);
  }, [fitTerminal, shouldSyncVisibleLayout]);

  // Handle app focus/blur events (macOS app switching)
  useEffect(() => {
    if (!shouldSyncVisibleLayout) {
      return;
    }

    const handleFocus = () => {
      if (terminalRef.current) {
        requestAnimationFrame(() => {
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
          fitTerminal();
        });
      }
    };

    return subscribeToXtermWindowFocus(handleFocus);
  }, [fitTerminal, shouldSyncVisibleLayout]);

  // Silent Reset: Proactively clear texture atlas every 30 mins to prevent long-term fragmentation
  useEffect(() => {
    if (!shouldSyncVisibleLayout) return;

    const preventGlitchInterval = setInterval(
      () => {
        const addon = rendererAddonRef.current;
        if (
          effectiveTerminalRenderer === 'webgl' &&
          terminalRef.current &&
          addon &&
          'clearTextureAtlas' in addon &&
          !document.hidden
        ) {
          requestAnimationFrame(() => {
            try {
              (addon as WebglAddon).clearTextureAtlas();
              terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
            } catch {
              // Ignore errors if addon is disposed or method missing
            }
          });
        }
      },
      1000 * 60 * 30
    ); // 30 minutes

    return () => clearInterval(preventGlitchInterval);
  }, [effectiveTerminalRenderer, shouldSyncVisibleLayout]);

  return {
    containerRef,
    isLoading,
    runtimeState,
    settings,
    write,
    fit: fitTerminal,
    terminal: terminalRef.current,
    findNext,
    findPrevious,
    searchState,
    clearSearch,
    clear,
    refreshRenderer,
    restartSession,
  };
}
