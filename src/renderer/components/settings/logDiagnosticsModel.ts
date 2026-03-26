import type { LogDiagnostics } from '@shared/types';

export interface LogDiagnosticsModel {
  currentLogPath: string;
  output: string;
  isLoading: boolean;
}

export function buildLogDiagnosticsModel({
  status,
  diagnostics,
}: {
  status: 'idle' | 'loading' | 'ready' | 'error';
  diagnostics: LogDiagnostics | null;
}): LogDiagnosticsModel {
  const currentLogPath = diagnostics?.path || 'Unavailable';

  if (status === 'loading' && !diagnostics) {
    return {
      currentLogPath,
      output: 'Loading log diagnostics...',
      isLoading: true,
    };
  }

  if (status === 'error') {
    return {
      currentLogPath,
      output: 'Log diagnostics unavailable',
      isLoading: false,
    };
  }

  if (diagnostics && diagnostics.lines.length > 0) {
    return {
      currentLogPath,
      output: diagnostics.lines.join('\n'),
      isLoading: false,
    };
  }

  return {
    currentLogPath,
    output: 'No recent log entries',
    isLoading: false,
  };
}
