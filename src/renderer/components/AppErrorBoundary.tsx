import { normalizeLocale, translate } from '@shared/i18n';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { getRendererEnvironment } from '@/lib/electronEnvironment';
import { getRendererDiagnosticsSnapshot } from '@/lib/runtimeDiagnostics';
import { appErrorBoundaryI18nKeys } from '@/lib/uiTranslationKeys';
import { useSettingsStore } from '@/stores/settings';
import {
  buildRendererErrorAutoRecoverySignature,
  formatErrorBoundaryMessage,
  shouldAutoRecoverRendererError,
} from './errorBoundaryUtils';
import { Button } from './ui/button';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  errorMessage: string | null;
}

const DEV_RENDERER_ERROR_RECOVERY_STORAGE_PREFIX = 'infilux:dev-renderer-error-recovery:';

function readLastRecoveryAttemptedAt(signature: string): number | null {
  try {
    const value = window.sessionStorage.getItem(
      `${DEV_RENDERER_ERROR_RECOVERY_STORAGE_PREFIX}${signature}`
    );
    if (!value) {
      return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function recordRecoveryAttempt(signature: string, attemptedAt: number): void {
  try {
    window.sessionStorage.setItem(
      `${DEV_RENDERER_ERROR_RECOVERY_STORAGE_PREFIX}${signature}`,
      String(attemptedAt)
    );
  } catch {
    // Ignore storage failures so the normal error boundary remains available.
  }
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
      errorMessage: formatErrorBoundaryMessage(error),
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const errorMessage = formatErrorBoundaryMessage(error);
    console.error('[renderer] Error boundary caught an error', {
      error,
      componentStack: errorInfo.componentStack,
      diagnostics: getRendererDiagnosticsSnapshot(),
    });

    const recoverySignature = buildRendererErrorAutoRecoverySignature({
      componentStack: errorInfo.componentStack,
      errorMessage,
    });
    const now = Date.now();

    if (
      shouldAutoRecoverRendererError({
        componentStack: errorInfo.componentStack,
        errorMessage,
        lastRecoveryAttemptedAt: readLastRecoveryAttemptedAt(recoverySignature),
        now,
        runtimeChannel: getRendererEnvironment().runtimeChannel,
      })
    ) {
      recordRecoveryAttempt(recoverySignature, now);
      console.info('[renderer] Reloading after dev-only renderer hook recovery trigger', {
        recoverySignature,
      });
      window.location.reload();
    }
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  private readonly handleCopy = async (): Promise<void> => {
    const payload = JSON.stringify(
      {
        message: this.state.errorMessage,
        diagnostics: getRendererDiagnosticsSnapshot(),
      },
      null,
      2
    );
    await navigator.clipboard.writeText(payload).catch(() => {});
  };

  private readonly t = (key: string) =>
    translate(normalizeLocale(useSettingsStore.getState().language), key);

  override render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="control-panel w-full max-w-xl rounded-2xl p-6">
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">{this.t(appErrorBoundaryI18nKeys.heading)}</h1>
            <p className="text-sm text-muted-foreground">
              {this.t(appErrorBoundaryI18nKeys.description)}
            </p>
            <pre className="max-h-56 overflow-auto rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap break-words">
              {this.state.errorMessage}
            </pre>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={this.handleReload}>
              {this.t(appErrorBoundaryI18nKeys.reload)}
            </Button>
            <Button type="button" variant="outline" onClick={() => void this.handleCopy()}>
              {this.t(appErrorBoundaryI18nKeys.copyDiagnostics)}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
