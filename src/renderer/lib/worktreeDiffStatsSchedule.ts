export interface DiffStatsScopeInput {
  collapsed: boolean;
  selectedPath?: string | null;
  livePaths: readonly string[];
  visiblePaths: readonly string[];
}

export type RegisteredDiffStatsScopeInput = DiffStatsScopeInput & {
  enabled: boolean;
};

export interface DiffStatsSchedule {
  refresh(): Promise<void>;
  start(): void;
  stop(): void;
  invalidate(path: string): void;
}

export interface CreateDiffStatsScheduleOptions {
  fetchPath: (path: string) => Promise<void>;
  getScope: () => readonly string[];
  now?: () => number;
  intervalMs?: number;
  setTimer?: (handler: () => void, delay: number) => ReturnType<typeof setInterval>;
  clearTimer?: (timer: ReturnType<typeof setInterval>) => void;
}

const REQUEST_BUDGET = 3;
const REQUEST_WINDOW_MS = 10_000;
const DEFAULT_INTERVAL_MS = 10_000;

interface DiffStatsScopePriority {
  selectedPaths: string[];
  livePaths: string[];
  visiblePaths: string[];
}

function appendUniquePath(paths: string[], path: string | null | undefined): void {
  if (path && !paths.includes(path)) {
    paths.push(path);
  }
}

function prioritizeDiffStatsPaths(...groups: readonly string[][]): string[] {
  const seen = new Set<string>();
  const prioritized: string[] = [];

  for (const group of groups) {
    for (const path of group) {
      if (!path || seen.has(path)) {
        continue;
      }
      seen.add(path);
      prioritized.push(path);
    }
  }

  return prioritized;
}

function collectDiffStatsScopePriority({
  collapsed,
  selectedPath,
  livePaths,
  visiblePaths,
}: DiffStatsScopeInput): DiffStatsScopePriority {
  if (collapsed) {
    return { selectedPaths: [], livePaths: [], visiblePaths: [] };
  }

  const visible = new Set(visiblePaths.filter(Boolean));
  const selectedPaths: string[] = [];
  const prioritizedLivePaths: string[] = [];
  const prioritizedVisiblePaths: string[] = [];

  if (selectedPath && visible.has(selectedPath)) {
    appendUniquePath(selectedPaths, selectedPath);
  }
  for (const path of livePaths) {
    if (visible.has(path)) {
      appendUniquePath(prioritizedLivePaths, path);
    }
  }
  for (const path of visiblePaths) {
    appendUniquePath(prioritizedVisiblePaths, path);
  }

  return {
    selectedPaths,
    livePaths: prioritizedLivePaths,
    visiblePaths: prioritizedVisiblePaths,
  };
}

export function deriveDiffStatsScope({
  collapsed,
  selectedPath,
  livePaths,
  visiblePaths,
}: DiffStatsScopeInput): string[] {
  const priority = collectDiffStatsScopePriority({
    collapsed,
    selectedPath,
    livePaths,
    visiblePaths,
  });
  return prioritizeDiffStatsPaths(
    priority.selectedPaths,
    priority.livePaths,
    priority.visiblePaths
  );
}

export function mergeDiffStatsScopes(scopes: readonly RegisteredDiffStatsScopeInput[]): string[] {
  const selectedPaths: string[] = [];
  const livePaths: string[] = [];
  const visiblePaths: string[] = [];

  for (const scope of scopes) {
    if (!scope.enabled) {
      continue;
    }
    const priority = collectDiffStatsScopePriority(scope);
    selectedPaths.push(...priority.selectedPaths);
    livePaths.push(...priority.livePaths);
    visiblePaths.push(...priority.visiblePaths);
  }

  return prioritizeDiffStatsPaths(selectedPaths, livePaths, visiblePaths);
}

export function createDiffStatsSchedule({
  fetchPath,
  getScope,
  now = Date.now,
  intervalMs = DEFAULT_INTERVAL_MS,
  setTimer = setInterval,
  clearTimer = clearInterval,
}: CreateDiffStatsScheduleOptions): DiffStatsSchedule {
  let timer: ReturnType<typeof setInterval> | undefined;
  let windowStartedAt = now();
  let startedInWindow = 0;
  let cursor = 0;
  const inFlight = new Set<string>();
  const invalidated = new Set<string>();

  const resetBudgetIfNeeded = () => {
    const currentTime = now();
    if (currentTime - windowStartedAt >= REQUEST_WINDOW_MS) {
      windowStartedAt = currentTime;
      startedInWindow = 0;
    }
  };

  const refresh = async () => {
    resetBudgetIfNeeded();
    const scope = [...new Set(getScope().filter(Boolean))];
    if (scope.length === 0 || startedInWindow >= REQUEST_BUDGET) {
      return;
    }

    const ordered = scope.slice(cursor).concat(scope.slice(0, cursor));
    const scheduled: Promise<void>[] = [];
    for (const path of ordered) {
      if (startedInWindow >= REQUEST_BUDGET) {
        break;
      }
      if (inFlight.has(path)) {
        continue;
      }

      invalidated.delete(path);
      inFlight.add(path);
      startedInWindow += 1;
      cursor = (scope.indexOf(path) + 1) % scope.length;
      scheduled.push(
        fetchPath(path).finally(() => {
          inFlight.delete(path);
          if (invalidated.has(path)) {
            void refresh();
          }
        })
      );
    }
    await Promise.all(scheduled);
  };

  return {
    refresh,
    start() {
      if (timer !== undefined) {
        return;
      }
      void refresh();
      timer = setTimer(() => void refresh(), intervalMs);
    },
    stop() {
      if (timer !== undefined) {
        clearTimer(timer);
        timer = undefined;
      }
    },
    invalidate(path) {
      invalidated.add(path);
    },
  };
}
