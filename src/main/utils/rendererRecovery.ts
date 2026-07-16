export interface RendererDiagnosticsSnapshot {
  windowId: number;
  totalWindowCount: number;
  isMainWindow: boolean;
  isWindowVisible: boolean;
  isWindowFocused: boolean;
  isWindowLoading: boolean;
  url: string;
}

interface RendererRecoveryWindowLike {
  id: number;
  isVisible: () => boolean;
  isFocused: () => boolean;
  webContents: {
    isLoading: () => boolean;
    getURL: () => string;
  };
}

interface RendererFailureContextOptions {
  diagnostics: RendererDiagnosticsSnapshot;
  reason: string;
  exitCode?: number;
}

export interface RendererRecoveryReloadDecisionInput {
  isLoading: boolean;
  maxRecoveryAttempts: number;
  recoveryAttemptCount: number;
}

export type RendererRecoveryReloadDecision = 'budget-exhausted' | 'reload' | 'skip-loading';

export function resolveRendererRecoveryReloadDecision({
  isLoading,
  maxRecoveryAttempts,
  recoveryAttemptCount,
}: RendererRecoveryReloadDecisionInput): RendererRecoveryReloadDecision {
  if (isLoading) {
    return 'skip-loading';
  }

  return recoveryAttemptCount >= maxRecoveryAttempts ? 'budget-exhausted' : 'reload';
}

export function shouldAutoRecoverRenderer(reason: string): boolean {
  return reason !== 'clean-exit' && reason !== 'killed';
}

export function captureRendererDiagnostics(
  window: RendererRecoveryWindowLike,
  mainWindow: RendererRecoveryWindowLike | null,
  totalWindowCount: number
): RendererDiagnosticsSnapshot {
  return {
    windowId: window.id,
    totalWindowCount,
    isMainWindow: mainWindow?.id === window.id,
    isWindowVisible: window.isVisible(),
    isWindowFocused: window.isFocused(),
    isWindowLoading: window.webContents.isLoading(),
    url: window.webContents.getURL(),
  };
}

export function buildRendererFailureContext({
  diagnostics,
  reason,
  exitCode,
}: RendererFailureContextOptions): RendererDiagnosticsSnapshot & {
  reason: string;
  exitCode?: number;
} {
  return {
    reason,
    exitCode,
    ...diagnostics,
  };
}
