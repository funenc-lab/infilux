export type UpdateLifecycleStatus =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateReleaseInfo {
  version?: string;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

export interface UpdateStatus {
  status: UpdateLifecycleStatus;
  info?: UpdateReleaseInfo;
  progress?: UpdateProgress;
  error?: string;
}

export interface UpdaterStateSnapshot {
  isSupported: boolean;
  autoUpdateEnabled: boolean;
  status: UpdateStatus | null;
}
