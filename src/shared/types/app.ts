import type { SessionBackendKind, SessionKind, SessionRuntimeState } from './session';

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

export type AppResourceGroup = 'runtime' | 'sessions' | 'services';
export type AppResourceStatus =
  | 'running'
  | 'ready'
  | 'reconnecting'
  | 'stopped'
  | 'error'
  | 'unavailable';
export type AppResourceActionKind =
  | 'reload-renderer'
  | 'kill-session'
  | 'stop-service'
  | 'terminate-process'
  | 'reclaim-idle-sessions';
export type AppResourceItemActionKind = Exclude<AppResourceActionKind, 'reclaim-idle-sessions'>;
export type AppResourceActionDangerLevel = 'safe' | 'danger';
export type AppServiceResourceKind = 'hapi-server' | 'hapi-runner' | 'cloudflared';

export interface AppResourceActionDescriptor {
  kind: AppResourceItemActionKind;
  dangerLevel: AppResourceActionDangerLevel;
}

interface AppResourceBase {
  id: string;
  group: AppResourceGroup;
  status: AppResourceStatus;
  availableActions: AppResourceActionDescriptor[];
}

export interface AppRuntimeProcessResource extends AppResourceBase {
  kind: 'electron-process';
  pid: number;
  processType: string;
  name: string | null;
  serviceName: string | null;
  workingSetSizeKb: number;
  peakWorkingSetSizeKb: number;
  privateBytesKb: number | null;
  isCurrentRenderer: boolean;
}

export interface AppSessionResource extends AppResourceBase {
  kind: 'session';
  sessionId: string;
  sessionKind: SessionKind;
  backend: SessionBackendKind;
  cwd: string;
  createdAt: number;
  persistOnDisconnect: boolean;
  pid: number | null;
  isActive: boolean | null;
  runtimeState?: SessionRuntimeState | null;
  metadata?: Record<string, unknown>;
}

export interface AppServiceResource extends AppResourceBase {
  kind: 'service';
  serviceKind: AppServiceResourceKind;
  pid: number | null;
  port: number | null;
  url: string | null;
  error: string | null;
  installed: boolean | null;
}

export type AppResourceItem = AppRuntimeProcessResource | AppSessionResource | AppServiceResource;

export interface AppResourceSnapshot {
  capturedAt: number;
  runtime: RuntimeMemorySnapshot;
  resources: AppResourceItem[];
}

export type AppResourceActionRequest =
  | {
      kind: 'reload-renderer';
      resourceId: string;
    }
  | {
      kind: 'kill-session';
      resourceId: string;
      sessionId: string;
    }
  | {
      kind: 'stop-service';
      resourceId: string;
      serviceKind: AppServiceResourceKind;
    }
  | {
      kind: 'terminate-process';
      resourceId: string;
      pid: number;
    }
  | {
      kind: 'reclaim-idle-sessions';
      resourceId: 'batch:idle-sessions';
    };

export interface AppResourceActionResult {
  ok: boolean;
  resourceId: string;
  kind: AppResourceActionKind;
  message: string;
  reclaimedCount?: number;
}
