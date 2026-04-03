export type SessionKind = 'terminal' | 'agent';
export type SessionBackendKind = 'local' | 'remote';

export interface SessionCreateOptions {
  cwd?: string;
  /** Internal use: OS cwd for the spawned process when logical cwd is virtual. */
  spawnCwd?: string;
  shell?: string;
  args?: string[];
  /** Internal use: fallback process command if the primary spawn fails. */
  fallbackShell?: string;
  /** Internal use: fallback process arguments if the primary spawn fails. */
  fallbackArgs?: string[];
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  shellConfig?: import('./shell').ShellConfig;
  /** Command to execute after shell is ready. */
  initialCommand?: string;
  kind?: SessionKind;
  persistOnDisconnect?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SessionAttachOptions {
  sessionId: string;
  cwd?: string;
}

export interface SessionResizeOptions {
  cols: number;
  rows: number;
}

export interface SessionDescriptor {
  sessionId: string;
  backend: SessionBackendKind;
  kind: SessionKind;
  cwd: string;
  persistOnDisconnect: boolean;
  createdAt: number;
  runtimeState?: SessionRuntimeState;
  metadata?: Record<string, unknown>;
}

export interface SessionOpenResult {
  session: SessionDescriptor;
  replay?: string;
}

export type SessionAttachResult = SessionOpenResult;

export interface SessionDataEvent {
  sessionId: string;
  data: string;
}

export interface SessionExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export type SessionRuntimeState = 'live' | 'reconnecting' | 'dead';

export interface SessionStateEvent {
  sessionId: string;
  state: SessionRuntimeState;
}
