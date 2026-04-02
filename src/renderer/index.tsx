import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import log from 'electron-log/renderer.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  applyImportedLegacyLocalStorageSnapshot,
  getManagedLocalStorageSnapshot,
  hasManagedLocalStorageDifferences,
  shouldHydrateManagedLocalStorageFromSharedSnapshot,
  shouldSyncManagedLocalStorageToSharedSession,
} from './App/storage';
import { createBootstrapStageReporter, prepareAppBootstrap, runAppBootstrap } from './bootstrap';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { RendererDiagnosticsProbe } from './components/RendererDiagnosticsProbe';
import { StartupShell } from './components/StartupShell';
import { ToastProvider } from './components/ui/toast';
import { applyBootstrapTheme } from './lib/bootstrapTheme';
import { ensureRendererBridgeFallback } from './lib/electronBridgeFallback';
import { getRendererDiagnosticsSnapshot } from './lib/runtimeDiagnostics';
import './styles/globals.css';

// Initialize renderer logging with conservative defaults
// Starts with 'error' level to minimize IPC overhead until settings are loaded
log.transports.ipc.level = 'error';
Object.assign(console, log.functions);

const setBootstrapStage = createBootstrapStageReporter();

setBootstrapStage('module-evaluated');
ensureRendererBridgeFallback();
applyBootstrapTheme(window.electronAPI.env.bootstrapTheme);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

function installGlobalRendererErrorHandlers(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.addEventListener('error', (event) => {
    console.error('[renderer] Uncaught window error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      diagnostics: getRendererDiagnosticsSnapshot(),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[renderer] Unhandled promise rejection', {
      reason: event.reason,
      diagnostics: getRendererDiagnosticsSnapshot(),
    });
  });
}

installGlobalRendererErrorHandlers();

function installManagedLocalStorageSyncOnUnload(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.addEventListener('beforeunload', () => {
    const currentSnapshot = getManagedLocalStorageSnapshot();
    if (Object.keys(currentSnapshot).length === 0) {
      return;
    }

    void window.electronAPI.sessionStorage.get().then((sessionState) => {
      const sharedSnapshot = sessionState?.localStorage ?? {};
      if (
        !shouldSyncManagedLocalStorageToSharedSession({
          currentSnapshot,
          sharedSnapshot,
        })
      ) {
        return;
      }

      return window.electronAPI.sessionStorage.syncLocalStorage(currentSnapshot);
    });
  });
}

async function hydrateManagedLocalStorageFromSharedSession(): Promise<void> {
  try {
    setBootstrapStage('hydrating-local-storage');
    const [sessionState, legacyLocalStorageMigrated] = await Promise.all([
      window.electronAPI.sessionStorage.get(),
      window.electronAPI.sessionStorage.isLegacyLocalStorageMigrated(),
    ]);
    const sharedSnapshot = sessionState?.localStorage ?? {};
    let currentSnapshot = getManagedLocalStorageSnapshot();

    if (
      shouldHydrateManagedLocalStorageFromSharedSnapshot({
        currentSnapshot,
        sharedSnapshot,
        legacyLocalStorageMigrated,
      })
    ) {
      const appliedKeys = applyImportedLegacyLocalStorageSnapshot(sharedSnapshot);
      currentSnapshot = getManagedLocalStorageSnapshot();
      console.info('[renderer] Hydrated managed localStorage from shared session state', {
        appliedKeyCount: appliedKeys.length,
        legacyLocalStorageMigrated,
        sharedHasRepositoryState: Boolean(sharedSnapshot['enso-repositories']),
      });
    }

    if (
      shouldSyncManagedLocalStorageToSharedSession({
        currentSnapshot,
        sharedSnapshot,
      })
    ) {
      await window.electronAPI.sessionStorage.syncLocalStorage(currentSnapshot);
    } else if (hasManagedLocalStorageDifferences(sharedSnapshot, currentSnapshot)) {
      console.info('[renderer] Skipped syncing managed localStorage to shared session state', {
        currentKeyCount: Object.keys(currentSnapshot).length,
        sharedKeyCount: Object.keys(sharedSnapshot).length,
      });
    }

    setBootstrapStage('hydration-complete');
  } catch (error) {
    setBootstrapStage('hydration-failed');
    console.error('[renderer] Failed to hydrate managed localStorage from shared session state', {
      error,
      diagnostics: getRendererDiagnosticsSnapshot(),
    });
  }
}

installManagedLocalStorageSyncOnUnload();

async function startApp(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) {
    setBootstrapStage('missing-root');
    return;
  }

  const rootRenderer = createRoot(root);
  setBootstrapStage('start-app-entered');
  await runAppBootstrap({
    renderStartupShell: () => {
      setBootstrapStage('rendering-startup-shell');
      rootRenderer.render(
        <StrictMode>
          <StartupShell />
        </StrictMode>
      );
      setBootstrapStage('startup-shell-rendered');
    },
    bootstrap: async () => {
      setBootstrapStage('importing-app');
      return prepareAppBootstrap({
        hydrate: hydrateManagedLocalStorageFromSharedSession,
        loadApp: () => import('./App'),
      });
    },
    renderApp: ({ appModule: { default: App }, appImportDurationMs }) => {
      console.info(
        `[renderer-bootstrap] App module imported in ${Math.round(appImportDurationMs)}ms`
      );
      setBootstrapStage('rendering-root');
      rootRenderer.render(
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <AppErrorBoundary>
                <RendererDiagnosticsProbe />
                <App />
              </AppErrorBoundary>
            </ToastProvider>
          </QueryClientProvider>
        </StrictMode>
      );
      setBootstrapStage('render-dispatched');
    },
  });
}

startApp().catch((error) => {
  setBootstrapStage('bootstrap-failed');
  console.error('[renderer] Failed to bootstrap app:', {
    error,
    diagnostics: getRendererDiagnosticsSnapshot(),
  });
});
