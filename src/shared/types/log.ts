export interface LogConfigUpdate {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug';
  retentionDays?: number;
}

export interface LogAgentStartupRecordRequest {
  message: string;
}

export interface LogDiagnostics {
  path: string;
  lines: string[];
}

export interface ActiveResourceSnapshot {
  total: number;
  byType: Record<string, number>;
}

export interface OpenFileDescriptorSnapshot {
  total: number | null;
  byType: Record<string, number>;
  command: string;
  timeoutMs: number;
  error?: string;
  errorCode?: string | null;
}

export interface MainProcessDiagnosticsSnapshot {
  capturedAt: number;
  pid: number;
  platform: NodeJS.Platform;
  uptimeSec: number;
  memoryUsage: {
    rssBytes: number;
    heapTotalBytes: number;
    heapUsedBytes: number;
    externalBytes: number;
    arrayBuffersBytes: number;
  };
  activeResources: ActiveResourceSnapshot;
  openFileDescriptors: OpenFileDescriptorSnapshot | null;
  sources: Record<string, unknown>;
}

export interface CaptureMainProcessDiagnosticsRequest {
  fdTimeoutMs?: number;
}
