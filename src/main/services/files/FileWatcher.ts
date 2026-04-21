import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { type AsyncSubscription, type Event, subscribe } from '@parcel/watcher';
import log from '../../utils/logger';
import { requestMainProcessDiagnosticsCapture } from '../../utils/mainProcessDiagnostics';

export type FileChangeCallback = (type: 'create' | 'update' | 'delete', path: string) => void;

const require = createRequire(import.meta.url);
const PARCEL_WATCHER_PACKAGE_NAME = '@parcel/watcher';

export function resolveFileWatcherBackendHint(
  platform: NodeJS.Platform = process.platform
): string {
  return platform === 'win32' ? 'windows' : 'native-default';
}

export interface FileWatcherRuntimeInfo {
  backendHint: string;
  inferredBackend: string;
  inferenceSource: string;
  bindingPackageName: string | null;
  bindingResolution: 'prebuilt-package' | 'release-build' | 'debug-build' | 'unresolved';
  bindingPath: string | null;
}

function resolveParcelWatcherPrebuiltPackageName(): string {
  let name = `@parcel/watcher-${process.platform}-${process.arch}`;
  if (process.platform === 'linux') {
    name += '-glibc';
  }
  return name;
}

function resolveWatcherBindingPath(): Pick<
  FileWatcherRuntimeInfo,
  'bindingPackageName' | 'bindingResolution' | 'bindingPath'
> {
  const packageEntryPath = require.resolve(PARCEL_WATCHER_PACKAGE_NAME);
  const packageDir = dirname(packageEntryPath);
  const prebuiltPackageName = resolveParcelWatcherPrebuiltPackageName();

  try {
    const bindingPath = require.resolve(prebuiltPackageName);
    return {
      bindingPackageName: prebuiltPackageName,
      bindingResolution: 'prebuilt-package',
      bindingPath,
    };
  } catch {
    const releasePath = join(packageDir, 'build', 'Release', 'watcher.node');
    try {
      require.resolve(releasePath);
      return {
        bindingPackageName: null,
        bindingResolution: 'release-build',
        bindingPath: releasePath,
      };
    } catch {
      const debugPath = join(packageDir, 'build', 'Debug', 'watcher.node');
      try {
        require.resolve(debugPath);
        return {
          bindingPackageName: null,
          bindingResolution: 'debug-build',
          bindingPath: debugPath,
        };
      } catch {
        return {
          bindingPackageName: null,
          bindingResolution: 'unresolved',
          bindingPath: null,
        };
      }
    }
  }
}

export function resolveFileWatcherRuntimeInfo(
  platform: NodeJS.Platform = process.platform
): FileWatcherRuntimeInfo {
  const backendHint = resolveFileWatcherBackendHint(platform);
  const bindingInfo = resolveWatcherBindingPath();

  if (platform === 'darwin') {
    return {
      backendHint,
      inferredBackend: 'fs-events',
      inferenceSource: '@parcel/watcher Backend.cc default selection for macOS',
      ...bindingInfo,
    };
  }

  if (platform === 'win32') {
    return {
      backendHint,
      inferredBackend: 'windows',
      inferenceSource: 'Explicit backend option for Windows',
      ...bindingInfo,
    };
  }

  return {
    backendHint,
    inferredBackend: 'default',
    inferenceSource: '@parcel/watcher default backend selection',
    ...bindingInfo,
  };
}

export class FileWatcher {
  private subscription: AsyncSubscription | null = null;
  private dirPath: string;
  private callback: FileChangeCallback;
  private readonly runtimeInfo: FileWatcherRuntimeInfo;

  constructor(dirPath: string, callback: FileChangeCallback) {
    this.dirPath = dirPath;
    this.callback = callback;
    this.runtimeInfo = resolveFileWatcherRuntimeInfo();
  }

  async start(): Promise<void> {
    const subscribeOptions = {
      ignore: ['node_modules', '.git', 'dist', 'out'],
      // Use native backend to avoid watchman dependency
      backend: process.platform === 'win32' ? ('windows' as const) : undefined,
    };

    try {
      this.subscription = await subscribe(
        this.dirPath,
        (err: Error | null, events: Event[]) => {
          if (err) {
            const diagnosticsId = requestMainProcessDiagnosticsCapture({
              event: 'file-watcher-runtime-error',
              context: {
                dirPath: this.dirPath,
                runtimeInfo: this.runtimeInfo,
              },
              error: err,
              throttleKey: `file-watcher-runtime-error:${this.runtimeInfo.inferredBackend}`,
            });
            log.error('File watcher runtime error', {
              diagnosticsId,
              dirPath: this.dirPath,
              runtimeInfo: this.runtimeInfo,
              errorCode:
                typeof (err as NodeJS.ErrnoException).code === 'string'
                  ? (err as NodeJS.ErrnoException).code
                  : null,
            });
            return;
          }

          for (const event of events) {
            this.callback(event.type, event.path);
          }
        },
        subscribeOptions
      );
    } catch (error) {
      const diagnosticsId = requestMainProcessDiagnosticsCapture({
        event: 'file-watcher-subscribe-failed',
        context: {
          dirPath: this.dirPath,
          runtimeInfo: this.runtimeInfo,
        },
        error,
        throttleKey: `file-watcher-subscribe-failed:${this.runtimeInfo.inferredBackend}`,
      });
      const nodeError = error as NodeJS.ErrnoException;
      log.error('File watcher subscribe failed', {
        diagnosticsId,
        dirPath: this.dirPath,
        runtimeInfo: this.runtimeInfo,
        errorCode: typeof nodeError.code === 'string' ? nodeError.code : null,
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  getRuntimeInfo(): FileWatcherRuntimeInfo {
    return this.runtimeInfo;
  }
}
