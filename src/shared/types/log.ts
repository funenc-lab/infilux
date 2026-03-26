export interface LogConfigUpdate {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug';
  retentionDays?: number;
}

export interface LogDiagnostics {
  path: string;
  lines: string[];
}
