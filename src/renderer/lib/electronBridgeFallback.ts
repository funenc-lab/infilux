import { getRendererEnvironment } from './electronEnvironment';

type NoopBridgeCallable = ((...args: unknown[]) => unknown) & {
  [key: string]: unknown;
};

type BridgeFallbackDefinition =
  | {
      kind: 'cleanup';
    }
  | {
      kind: 'promise';
      value: unknown;
    };

const noopCleanup = () => {};
const FALLBACK_METHODS = new Map<string, BridgeFallbackDefinition>([
  ['git.getBranches', { kind: 'promise', value: [] }],
  ['git.getLog', { kind: 'promise', value: [] }],
  ['notification.onAgentStatusUpdate', { kind: 'cleanup' }],
  ['notification.onAgentStop', { kind: 'cleanup' }],
  ['notification.onAskUserQuestion', { kind: 'cleanup' }],
  ['notification.onClick', { kind: 'cleanup' }],
  ['notification.onPreToolUse', { kind: 'cleanup' }],
  ['remote.listDirectory', { kind: 'promise', value: [] }],
  ['remote.listProfiles', { kind: 'promise', value: [] }],
  ['remote.onStatusChange', { kind: 'cleanup' }],
  ['sessionStorage.get', { kind: 'promise', value: {} }],
  ['sessionStorage.isLegacyLocalStorageMigrated', { kind: 'promise', value: false }],
  ['sessionStorage.syncLocalStorage', { kind: 'promise', value: undefined }],
  ['shell.detect', { kind: 'promise', value: [] }],
  ['worktree.list', { kind: 'promise', value: [] }],
]);

function getFallbackDefinition(path: string[]): BridgeFallbackDefinition | undefined {
  return FALLBACK_METHODS.get(path.join('.'));
}

function getFallbackPromiseValue(path: string[]): unknown {
  const fallback = getFallbackDefinition(path);
  if (fallback?.kind === 'promise') {
    return fallback.value;
  }

  return undefined;
}

function resolveFallbackCall(path: string[]): unknown {
  const fallback = getFallbackDefinition(path);
  if (fallback?.kind === 'cleanup') {
    return noopCleanup;
  }
  if (fallback?.kind === 'promise') {
    return Promise.resolve(fallback.value);
  }

  return createNoopBridgeCallable(path);
}

function createNoopBridgeCallable(path: string[] = []): NoopBridgeCallable {
  const base = (() => resolveFallbackCall(path)) as NoopBridgeCallable;
  return new Proxy(base, {
    apply() {
      return resolveFallbackCall(path);
    },
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) {
        return () => '';
      }
      if (prop === 'then') {
        const promise = Promise.resolve(getFallbackPromiseValue(path));
        return promise.then.bind(promise);
      }
      if (prop === 'catch') {
        const promise = Promise.resolve(getFallbackPromiseValue(path));
        return promise.catch.bind(promise);
      }
      if (prop === 'finally') {
        const promise = Promise.resolve(getFallbackPromiseValue(path));
        return promise.finally.bind(promise);
      }
      if (prop === 'toJSON' || prop === 'valueOf') {
        return () => undefined;
      }
      if (prop === 'name') {
        return 'noopBridgeCallable';
      }
      if (prop === 'length') {
        return 0;
      }
      return createNoopBridgeCallable([...path, String(prop)]);
    },
  }) as NoopBridgeCallable;
}

function proxifyNamespace<T extends object>(namespace: T, path: string[] = []): T {
  return new Proxy(namespace, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) {
        const value = Reflect.get(target, prop, receiver);
        if (value && typeof value === 'object') {
          return proxifyNamespace(value as object, [...path, String(prop)]);
        }
        return value;
      }

      return createNoopBridgeCallable([...path, String(prop)]);
    },
  }) as T;
}

export function ensureRendererBridgeFallback(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const currentBridge = (window as Window & { electronAPI?: Record<string, unknown> }).electronAPI;
  if (currentBridge) {
    return;
  }

  (window as Window & { electronAPI: unknown }).electronAPI = proxifyNamespace({
    env: getRendererEnvironment(),
  } as Record<string, unknown>) as unknown as Window['electronAPI'];
}
