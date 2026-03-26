import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { RUNTIME_STATE_DIRNAME } from '@shared/paths';
import type {
  SessionAttachResult,
  SessionCreateOptions,
  SessionDataEvent,
  SessionDescriptor,
  SessionExitEvent,
} from '@shared/types';
import { app } from 'electron';
import {
  getLocalSupervisorSource,
  LOCAL_SUPERVISOR_RUNTIME_VERSION,
} from './LocalSupervisorSource';

const LOCAL_SUPERVISOR_DIRNAME = 'local-supervisor';
const DAEMON_INFO_FILENAME = 'local-supervisor-daemon.json';
const DAEMON_SOURCE_FILENAME = 'local-supervisor-daemon.js';
const START_TIMEOUT_MS = 5000;

interface LocalSupervisorDaemonInfo {
  host: string;
  port: number;
  pid: number;
  token: string;
  runtimeVersion?: string;
}

interface LocalSupervisorCreateRequest {
  sessionId: string;
  options: SessionCreateOptions;
}

interface LocalSupervisorSubscriptionState {
  socket: net.Socket;
  buffer: string;
  authenticated: boolean;
}

type DisconnectListener = () => void;

let requestCounter = 0;

function nextRequestId(): number {
  requestCounter += 1;
  return requestCounter;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cloneDescriptor(descriptor: SessionDescriptor): SessionDescriptor {
  return {
    ...descriptor,
    metadata: descriptor.metadata ? { ...descriptor.metadata } : undefined,
  };
}

function cloneAttachResult(result: SessionAttachResult): SessionAttachResult {
  return {
    session: cloneDescriptor(result.session),
    replay: result.replay,
  };
}

function getDaemonDirectory(): string {
  return join(app.getPath('home'), RUNTIME_STATE_DIRNAME, LOCAL_SUPERVISOR_DIRNAME);
}

function getDaemonInfoPath(): string {
  return join(getDaemonDirectory(), DAEMON_INFO_FILENAME);
}

function getDaemonSourcePath(): string {
  return join(getDaemonDirectory(), DAEMON_SOURCE_FILENAME);
}

function parseDaemonInfo(raw: string): LocalSupervisorDaemonInfo | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LocalSupervisorDaemonInfo>;
    if (
      typeof parsed.host === 'string' &&
      typeof parsed.port === 'number' &&
      typeof parsed.pid === 'number' &&
      typeof parsed.token === 'string'
    ) {
      return {
        host: parsed.host,
        port: parsed.port,
        pid: parsed.pid,
        token: parsed.token,
        runtimeVersion: parsed.runtimeVersion,
      };
    }
  } catch {
    // Ignore invalid daemon info.
  }
  return null;
}

export class LocalSupervisorRuntime {
  private readonly dataListeners = new Set<(event: SessionDataEvent) => void>();
  private readonly exitListeners = new Set<(event: SessionExitEvent) => void>();
  private readonly disconnectListeners = new Set<DisconnectListener>();
  private subscriptionPromise: Promise<void> | null = null;
  private subscription: LocalSupervisorSubscriptionState | null = null;

  onData(listener: (event: SessionDataEvent) => void): () => void {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  }

  onExit(listener: (event: SessionExitEvent) => void): () => void {
    this.exitListeners.add(listener);
    return () => {
      this.exitListeners.delete(listener);
    };
  }

  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  async createSession(
    request: LocalSupervisorCreateRequest
  ): Promise<{ session: SessionDescriptor }> {
    const result = await this.request<{ session: SessionDescriptor }>('session:create', request);
    await this.ensureSubscribed();
    return {
      session: cloneDescriptor(result.session),
    };
  }

  async attachSession(sessionId: string): Promise<SessionAttachResult> {
    const result = await this.request<SessionAttachResult>('session:attach', {
      sessionId,
    });
    await this.ensureSubscribed();
    return cloneAttachResult(result);
  }

  async detachSession(sessionId: string): Promise<void> {
    await this.request('session:detach', { sessionId });
  }

  async killSession(sessionId: string): Promise<void> {
    await this.request('session:kill', { sessionId });
  }

  async writeSession(sessionId: string, data: string): Promise<void> {
    await this.request('session:write', { sessionId, data });
  }

  async resizeSession(sessionId: string, cols: number, rows: number): Promise<void> {
    await this.request('session:resize', { sessionId, cols, rows });
  }

  async getSessionActivity(sessionId: string): Promise<boolean> {
    return this.request<boolean>('session:getActivity', { sessionId });
  }

  async hasSession(sessionId: string): Promise<boolean> {
    return this.request<boolean>('session:has', { sessionId });
  }

  private emitData(event: SessionDataEvent): void {
    for (const listener of this.dataListeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[LocalSupervisorRuntime] Failed to deliver data event:', error);
      }
    }
  }

  private emitExit(event: SessionExitEvent): void {
    for (const listener of this.exitListeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[LocalSupervisorRuntime] Failed to deliver exit event:', error);
      }
    }
  }

  private emitDisconnect(): void {
    for (const listener of this.disconnectListeners) {
      try {
        listener();
      } catch (error) {
        console.warn('[LocalSupervisorRuntime] Failed to deliver disconnect event:', error);
      }
    }
  }

  private async request<T = void>(method: string, params?: unknown): Promise<T> {
    const info = await this.ensureDaemon();
    return new Promise<T>((resolve, reject) => {
      const socket = net.createConnection({
        host: info.host,
        port: info.port,
      });
      const requestId = nextRequestId();
      let buffer = '';
      let authenticated = false;
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        callback();
      };

      socket.setEncoding('utf8');
      socket.on('connect', () => {
        socket.write(
          `${JSON.stringify({
            id: requestId,
            method: 'daemon:auth',
            params: { token: info.token },
          })}\n`
        );
      });
      socket.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          let message: {
            id?: number;
            result?: unknown;
            error?: string;
          };
          try {
            message = JSON.parse(line) as {
              id?: number;
              result?: unknown;
              error?: string;
            };
          } catch (error) {
            finish(() => reject(error));
            return;
          }

          if (message.id !== requestId) {
            continue;
          }

          if (!authenticated) {
            if (message.error) {
              finish(() => reject(new Error(message.error)));
              return;
            }
            const ok = Boolean(
              message.result &&
                typeof message.result === 'object' &&
                'ok' in message.result &&
                message.result.ok
            );
            if (!ok) {
              finish(() => reject(new Error('Local supervisor authentication failed')));
              return;
            }
            authenticated = true;
            socket.write(
              `${JSON.stringify({
                id: requestId,
                method,
                params,
              })}\n`
            );
            continue;
          }

          if (message.error) {
            finish(() => reject(new Error(message.error)));
            return;
          }

          finish(() => resolve((message.result as T) ?? (undefined as T)));
          return;
        }
      });
      socket.on('error', (error) => {
        finish(() => reject(error));
      });
      socket.on('close', () => {
        if (!settled) {
          reject(new Error(`Local supervisor connection closed during ${method}`));
        }
      });
    });
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscription?.authenticated) {
      return;
    }
    if (this.subscriptionPromise) {
      await this.subscriptionPromise;
      return;
    }

    this.subscriptionPromise = this.openSubscription();
    try {
      await this.subscriptionPromise;
    } finally {
      this.subscriptionPromise = null;
    }
  }

  private async openSubscription(): Promise<void> {
    const info = await this.ensureDaemon();
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({
        host: info.host,
        port: info.port,
      });
      const requestId = nextRequestId();
      const state: LocalSupervisorSubscriptionState = {
        socket,
        buffer: '',
        authenticated: false,
      };
      let resolved = false;

      const fail = (error: unknown) => {
        if (resolved) {
          return;
        }
        resolved = true;
        reject(error);
      };

      socket.setEncoding('utf8');
      socket.on('connect', () => {
        socket.write(
          `${JSON.stringify({
            id: requestId,
            method: 'daemon:auth',
            params: {
              token: info.token,
              subscribe: true,
            },
          })}\n`
        );
      });
      socket.on('data', (chunk) => {
        state.buffer += chunk;
        const lines = state.buffer.split('\n');
        state.buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          let message:
            | {
                id?: number;
                result?: unknown;
                error?: string;
              }
            | {
                type?: string;
                event?: string;
                payload?: unknown;
              };
          try {
            message = JSON.parse(line) as
              | {
                  id?: number;
                  result?: unknown;
                  error?: string;
                }
              | {
                  type?: string;
                  event?: string;
                  payload?: unknown;
                };
          } catch (error) {
            fail(error);
            return;
          }

          if (!state.authenticated && 'id' in message && message.id === requestId) {
            if (message.error) {
              fail(new Error(message.error));
              return;
            }
            const ok = Boolean(
              message.result &&
                typeof message.result === 'object' &&
                'ok' in message.result &&
                message.result.ok
            );
            if (!ok) {
              fail(new Error('Local supervisor subscription authentication failed'));
              return;
            }

            state.authenticated = true;
            this.subscription = state;
            if (!resolved) {
              resolved = true;
              resolve();
            }
            continue;
          }

          if (!('type' in message) || message.type !== 'event') {
            continue;
          }

          if (message.event === 'session:data' && message.payload) {
            this.emitData(message.payload as SessionDataEvent);
            continue;
          }

          if (message.event === 'session:exit' && message.payload) {
            this.emitExit(message.payload as SessionExitEvent);
          }
        }
      });
      socket.on('error', (error) => {
        if (!resolved) {
          fail(error);
          return;
        }
        console.warn('[LocalSupervisorRuntime] Subscription socket error:', error);
      });
      socket.on('close', () => {
        const wasCurrent = this.subscription === state;
        if (wasCurrent) {
          this.subscription = null;
        }
        if (!resolved) {
          resolved = true;
          reject(new Error('Local supervisor subscription closed before authentication'));
          return;
        }
        if (wasCurrent) {
          this.emitDisconnect();
        }
      });
    });
  }

  private async ensureDaemon(): Promise<LocalSupervisorDaemonInfo> {
    await this.ensureDaemonSource();

    const existing = await this.readDaemonInfo();
    if (existing) {
      try {
        await this.ping(existing);
        return existing;
      } catch {
        await rm(getDaemonInfoPath(), { force: true }).catch(() => {});
      }
    }

    return this.startDaemon();
  }

  private async startDaemon(): Promise<LocalSupervisorDaemonInfo> {
    const sourcePath = getDaemonSourcePath();
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    };

    const child = spawn(process.execPath, [sourcePath, '--daemon'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env,
    });
    child.unref();

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await delay(100);
      const info = await this.readDaemonInfo();
      if (!info) {
        continue;
      }
      try {
        await this.ping(info);
        return info;
      } catch {
        // Wait until the daemon becomes reachable.
      }
    }

    throw new Error('Local supervisor daemon start timed out');
  }

  private async ping(info: LocalSupervisorDaemonInfo): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({
        host: info.host,
        port: info.port,
      });
      const requestId = nextRequestId();
      let buffer = '';
      let authenticated = false;
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        callback();
      };

      socket.setEncoding('utf8');
      socket.on('connect', () => {
        socket.write(
          `${JSON.stringify({
            id: requestId,
            method: 'daemon:auth',
            params: { token: info.token },
          })}\n`
        );
      });
      socket.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const message = JSON.parse(line) as {
            id?: number;
            result?: unknown;
            error?: string;
          };
          if (message.id !== requestId) {
            continue;
          }

          if (!authenticated) {
            if (message.error) {
              finish(() => reject(new Error(message.error)));
              return;
            }
            authenticated = true;
            socket.write(
              `${JSON.stringify({
                id: requestId,
                method: 'daemon:ping',
              })}\n`
            );
            continue;
          }

          if (message.error) {
            finish(() => reject(new Error(message.error)));
            return;
          }

          finish(resolve);
          return;
        }
      });
      socket.on('error', (error) => {
        finish(() => reject(error));
      });
      socket.on('close', () => {
        if (!settled) {
          reject(new Error('Local supervisor ping connection closed'));
        }
      });
    });
  }

  private async ensureDaemonSource(): Promise<void> {
    const sourcePath = getDaemonSourcePath();
    mkdirSync(dirname(sourcePath), { recursive: true });
    const nextSource = getLocalSupervisorSource();

    try {
      const currentSource = readFileSync(sourcePath, 'utf8');
      if (currentSource === nextSource) {
        return;
      }
    } catch {
      // Rewrite the daemon source below.
    }

    writeFileSync(sourcePath, nextSource, {
      encoding: 'utf8',
      mode: 0o700,
    });
  }

  private async readDaemonInfo(): Promise<LocalSupervisorDaemonInfo | null> {
    try {
      const infoPath = getDaemonInfoPath();
      const fileStats = await stat(infoPath);
      if (!fileStats.isFile()) {
        return null;
      }
      const raw = readFileSync(infoPath, 'utf8');
      const info = parseDaemonInfo(raw);
      if (!info) {
        return null;
      }
      if (info.runtimeVersion && info.runtimeVersion !== LOCAL_SUPERVISOR_RUNTIME_VERSION) {
        return null;
      }
      return info;
    } catch {
      return null;
    }
  }
}

export const localSupervisorRuntime = new LocalSupervisorRuntime();
