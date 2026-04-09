import type { AppResourceItem, AppResourceSnapshot } from '@shared/types';

export type AppResourceStatusTriggerTone = 'neutral' | 'success' | 'warning' | 'destructive';

export interface AppResourceStatusTriggerViewModel {
  tone: AppResourceStatusTriggerTone;
  badgeLabel: string | null;
  badgeClassName: string | null;
}

function isDestructiveResource(resource: AppResourceItem): boolean {
  if (resource.status === 'error') {
    return true;
  }

  if (resource.kind !== 'session') {
    return false;
  }

  return resource.runtimeState === 'dead' || resource.reclaimable;
}

function isWarningResource(resource: AppResourceItem): boolean {
  return resource.status === 'reconnecting';
}

function isManagedActiveResource(resource: AppResourceItem): boolean {
  if (resource.kind === 'electron-process') {
    return false;
  }

  return resource.status === 'running' || resource.status === 'ready';
}

function toBadgeLabel(count: number): string | null {
  return count > 0 ? String(count) : null;
}

export function buildAppResourceStatusTriggerViewModel(
  snapshot: AppResourceSnapshot
): AppResourceStatusTriggerViewModel {
  let destructiveCount = 0;
  let warningCount = 0;
  let activeCount = 0;

  for (const resource of snapshot.resources) {
    if (isDestructiveResource(resource)) {
      destructiveCount += 1;
      continue;
    }

    if (isWarningResource(resource)) {
      warningCount += 1;
      continue;
    }

    if (isManagedActiveResource(resource)) {
      activeCount += 1;
    }
  }

  if (destructiveCount > 0) {
    return {
      tone: 'destructive',
      badgeLabel: toBadgeLabel(destructiveCount),
      badgeClassName: 'control-badge-destructive',
    };
  }

  if (warningCount > 0) {
    return {
      tone: 'warning',
      badgeLabel: toBadgeLabel(warningCount),
      badgeClassName: 'control-badge-warning',
    };
  }

  if (activeCount > 0) {
    return {
      tone: 'success',
      badgeLabel: toBadgeLabel(activeCount),
      badgeClassName: 'control-badge-success',
    };
  }

  return {
    tone: 'neutral',
    badgeLabel: null,
    badgeClassName: null,
  };
}
