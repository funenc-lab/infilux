export enum AppCategory {
  Terminal = 'terminal',
  Editor = 'editor',
  Finder = 'finder',
}

export interface DetectedApp {
  name: string;
  bundleId: string;
  category: AppCategory;
  path: string;
  icon?: string; // base64 encoded icon
}

export interface ProxySettings {
  enabled: boolean;
  server: string; // e.g., "127.0.0.1:7897" or "http://127.0.0.1:7897"
  bypassList: string; // comma-separated list of hosts to bypass
  useProxyForUpdates: boolean;
}

export interface RecentEditorProject {
  path: string;
  editorName: string; // "VS Code" | "Cursor" | "Windsurf" etc.
  editorBundleId: string;
}

export interface ValidateLocalPathResult {
  exists: boolean;
  isDirectory: boolean;
}

export interface RuntimeMemoryProcessMetric {
  pid: number;
  type: string;
  name: string | null;
  serviceName: string | null;
  workingSetSizeKb: number;
  peakWorkingSetSizeKb: number;
  privateBytesKb: number | null;
}

export interface RuntimeProcessMemoryDetails {
  privateKb: number;
  sharedKb: number;
  residentSetKb: number | null;
}

export interface RuntimeMemorySnapshot {
  capturedAt: number;
  processCount: number;
  rendererProcessId: number | null;
  rendererMemory: RuntimeProcessMemoryDetails | null;
  rendererMetric: RuntimeMemoryProcessMetric | null;
  browserMetric: RuntimeMemoryProcessMetric | null;
  gpuMetric: RuntimeMemoryProcessMetric | null;
  totalAppWorkingSetSizeKb: number;
  totalAppPrivateBytesKb: number;
}
