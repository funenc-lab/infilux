import {
  createStartupTimelineRecorder,
  formatStartupTimelineEntry,
  type StartupTimelineRecorder,
} from '@shared/utils/startupTimeline';

export interface PrepareAppBootstrapOptions<TAppModule> {
  hydrate: () => Promise<void>;
  loadApp: () => Promise<TAppModule>;
  now?: () => number;
}

export interface PrepareAppBootstrapResult<TAppModule> {
  appModule: TAppModule;
  appImportDurationMs: number;
}

export interface RunAppBootstrapOptions<TAppModule> {
  maxAttempts?: number;
  onBootstrapRetry?: (error: unknown, attempt: number) => void;
  renderStartupShell: () => void;
  bootstrap: () => Promise<TAppModule>;
  renderApp: (appModule: TAppModule) => void;
}

export interface BootstrapStageTarget {
  __infiluxBootstrapStage?: string;
  dispatchEvent: (event: Event) => boolean;
}

export interface CreateBootstrapStageReporterOptions {
  recorder?: StartupTimelineRecorder;
  getTarget?: () => BootstrapStageTarget | undefined;
  log?: (message: string) => void;
  createStageChangeEvent?: (stage: string) => Event;
}

export function createBootstrapStageReporter({
  recorder = createStartupTimelineRecorder('renderer'),
  getTarget = () =>
    typeof window === 'undefined' ? undefined : (window as unknown as BootstrapStageTarget),
  log = (message) => console.info(message),
  createStageChangeEvent = (stage) =>
    new CustomEvent('infilux-bootstrap-stage-change', {
      detail: stage,
    }),
}: CreateBootstrapStageReporterOptions = {}): (stage: string) => void {
  return (stage: string) => {
    const target = getTarget();
    if (!target) {
      return;
    }

    target.__infiluxBootstrapStage = stage;
    target.dispatchEvent(createStageChangeEvent(stage));
    log(formatStartupTimelineEntry(recorder.markStage(stage)));
  };
}

export async function prepareAppBootstrap<TAppModule>({
  hydrate,
  loadApp,
  now = () => performance.now(),
}: PrepareAppBootstrapOptions<TAppModule>): Promise<PrepareAppBootstrapResult<TAppModule>> {
  const appImportStartedAt = now();
  const appModulePromise = loadApp();
  const hydrationPromise = hydrate();
  const appModule = await appModulePromise;
  const appImportDurationMs = now() - appImportStartedAt;

  await hydrationPromise;

  return {
    appModule,
    appImportDurationMs,
  };
}

export async function runAppBootstrap<TAppModule>({
  maxAttempts = 2,
  onBootstrapRetry,
  renderStartupShell,
  bootstrap,
  renderApp,
}: RunAppBootstrapOptions<TAppModule>): Promise<void> {
  renderStartupShell();
  const attemptLimit = Math.max(1, Math.floor(maxAttempts));

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    let appModule: TAppModule;
    try {
      appModule = await bootstrap();
    } catch (error) {
      if (attempt >= attemptLimit) {
        throw error;
      }
      onBootstrapRetry?.(error, attempt);
      continue;
    }

    renderApp(appModule);
    return;
  }
}
