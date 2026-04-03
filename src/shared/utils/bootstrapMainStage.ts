export type BootstrapMainStage =
  | 'module-evaluated'
  | 'app-ready'
  | 'pre-window-startup-complete'
  | 'main-init-complete'
  | 'main-window-created'
  | 'hapi-auto-start-queued'
  | 'auto-updater-initialized';

const BOOTSTRAP_MAIN_STAGE_ARGUMENT_PREFIX = '--infilux-bootstrap-main-stage=';

const VALID_BOOTSTRAP_MAIN_STAGES = new Set<BootstrapMainStage>([
  'module-evaluated',
  'app-ready',
  'pre-window-startup-complete',
  'main-init-complete',
  'main-window-created',
  'hapi-auto-start-queued',
  'auto-updater-initialized',
]);

function normalizeBootstrapMainStage(value: unknown): BootstrapMainStage | null {
  return typeof value === 'string' && VALID_BOOTSTRAP_MAIN_STAGES.has(value as BootstrapMainStage)
    ? (value as BootstrapMainStage)
    : null;
}

export function encodeBootstrapMainStageArgument(stage: BootstrapMainStage): string {
  return `${BOOTSTRAP_MAIN_STAGE_ARGUMENT_PREFIX}${encodeURIComponent(stage)}`;
}

export function parseBootstrapMainStageFromArgv(
  argv: readonly string[]
): BootstrapMainStage | null {
  const encodedStage = argv.find((entry) => entry.startsWith(BOOTSTRAP_MAIN_STAGE_ARGUMENT_PREFIX));
  if (!encodedStage) {
    return null;
  }

  try {
    return normalizeBootstrapMainStage(
      decodeURIComponent(encodedStage.slice(BOOTSTRAP_MAIN_STAGE_ARGUMENT_PREFIX.length))
    );
  } catch {
    return null;
  }
}
