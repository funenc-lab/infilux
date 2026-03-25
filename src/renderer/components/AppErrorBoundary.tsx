import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { getRendererDiagnosticsSnapshot } from '@/lib/runtimeDiagnostics';
import { formatErrorBoundaryMessage } from './errorBoundaryUtils';
import { Button } from './ui/button';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  errorMessage: string | null;
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
    console.error('[renderer] Error boundary caught an error', {
      error,
      componentStack: errorInfo.componentStack,
      diagnostics: getRendererDiagnosticsSnapshot(),
    });
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

  override render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">The app ran into an unexpected error.</h1>
            <p className="text-sm text-muted-foreground">
              You can reload the renderer now. Diagnostic details can also be copied for debugging.
            </p>
            <pre className="max-h-56 overflow-auto rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap break-words">
              {this.state.errorMessage}
            </pre>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={this.handleReload}>
              Reload App
            </Button>
            <Button type="button" variant="outline" onClick={() => void this.handleCopy()}>
              Copy Diagnostics
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
