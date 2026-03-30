import type { LogDiagnostics } from '@shared/types';
import type { TFunction } from '@/i18n';

export interface LogDiagnosticsModel {
  currentLogPath: string;
  output: string;
  isLoading: boolean;
}

export function buildLogDiagnosticsModel({
  status,
  diagnostics,
  t,
}: {
  status: 'idle' | 'loading' | 'ready' | 'error';
  diagnostics: LogDiagnostics | null;
  t: TFunction;
}): LogDiagnosticsModel {
  const currentLogPath = diagnostics?.path || t('Unavailable');

  if (status === 'loading' && !diagnostics) {
    return {
      currentLogPath,
      output: t('Loading log diagnostics...'),
      isLoading: true,
    };
  }

  if (status === 'error') {
    return {
      currentLogPath,
      output: t('Log diagnostics unavailable'),
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
    output: t('No recent log entries'),
    isLoading: false,
  };
}
