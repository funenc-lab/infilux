import type {
  AppResourceActionDescriptor,
  AppResourceActionRequest,
  AppResourceItem,
  AppResourceSnapshot,
  AppRuntimeProcessResource,
  AppServiceResource,
  AppSessionResource,
} from '@shared/types';
import { formatMemoryFromKb } from './appResourceStatusModel';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface AppResourceManagerActionViewModel {
  key: string;
  label: string;
  dangerLevel: 'safe' | 'danger';
  request: AppResourceActionRequest;
}

export interface AppResourceManagerMetricViewModel {
  key: string;
  label: string;
  value: string;
}

export interface AppResourceManagerBulkActionViewModel {
  key: string;
  label: string;
  description: string;
  disabled: boolean;
  request: Extract<AppResourceActionRequest, { kind: 'reclaim-idle-sessions' }>;
}

export interface AppResourceManagerItemViewModel {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  metrics: AppResourceManagerMetricViewModel[];
  actions: AppResourceManagerActionViewModel[];
  resource: AppResourceItem;
}

export interface AppResourceManagerSectionViewModel {
  key: string;
  title: string;
  items: AppResourceManagerItemViewModel[];
}

export interface AppResourceActionConfirmationCopy {
  title: string;
  description: string;
  confirmLabel: string;
}

function getActionLabel(
  action: AppResourceActionDescriptor,
  _resource: AppResourceItem,
  translate: Translate
): string {
  switch (action.kind) {
    case 'reload-renderer':
      return translate('Reload Renderer');
    case 'kill-session':
      return translate('Kill Session');
    case 'stop-service':
      return translate('Stop Service');
    case 'terminate-process':
      return translate('Force Terminate');
  }
}

function toActionRequest(
  action: AppResourceActionDescriptor,
  resource: AppResourceItem
): AppResourceActionRequest {
  switch (action.kind) {
    case 'reload-renderer':
      return {
        kind: 'reload-renderer',
        resourceId: resource.id,
      };
    case 'kill-session':
      if (resource.kind !== 'session') {
        throw new Error(`Resource ${resource.id} does not support session actions.`);
      }
      return {
        kind: 'kill-session',
        resourceId: resource.id,
        sessionId: resource.sessionId,
      };
    case 'stop-service':
      if (resource.kind !== 'service') {
        throw new Error(`Resource ${resource.id} does not support service actions.`);
      }
      return {
        kind: 'stop-service',
        resourceId: resource.id,
        serviceKind: resource.serviceKind,
      };
    case 'terminate-process':
      if (resource.kind !== 'electron-process') {
        throw new Error(`Resource ${resource.id} does not support process actions.`);
      }
      return {
        kind: 'terminate-process',
        resourceId: resource.id,
        pid: resource.pid,
      };
  }
}

function resolveProcessTitle(resource: AppRuntimeProcessResource, translate: Translate): string {
  if (resource.isCurrentRenderer) {
    return translate('Renderer process');
  }

  switch (resource.processType) {
    case 'Browser':
      return translate('Browser process');
    case 'GPU':
      return translate('GPU process');
    case 'Utility':
      return translate('Utility process');
    default:
      return translate('{{type}} process', { type: resource.processType });
  }
}

function resolveServiceTitle(resource: AppServiceResource, translate: Translate): string {
  switch (resource.serviceKind) {
    case 'hapi-server':
      return translate('Hapi Server');
    case 'hapi-runner':
      return translate('Hapi Runner');
    case 'cloudflared':
      return translate('Cloudflared');
  }
}

function resolveStatusLabel(resource: AppResourceItem, translate: Translate): string {
  return translate(resource.status);
}

function buildRuntimeMetrics(
  resource: AppRuntimeProcessResource,
  translate: Translate
): AppResourceManagerMetricViewModel[] {
  const unavailable = translate('Unavailable');

  return [
    {
      key: 'working-set',
      label: translate('Working set'),
      value: formatMemoryFromKb(resource.workingSetSizeKb, unavailable),
    },
    {
      key: 'private-bytes',
      label: translate('Private memory'),
      value: formatMemoryFromKb(resource.privateBytesKb, unavailable),
    },
  ];
}

function buildSessionMetrics(
  resource: AppSessionResource,
  translate: Translate
): AppResourceManagerMetricViewModel[] {
  return [
    {
      key: 'cwd',
      label: translate('Working directory'),
      value: resource.cwd,
    },
    {
      key: 'backend',
      label: translate('Backend'),
      value: resource.backend,
    },
  ];
}

function buildServiceMetrics(
  resource: AppServiceResource,
  translate: Translate
): AppResourceManagerMetricViewModel[] {
  const metrics: AppResourceManagerMetricViewModel[] = [];

  if (resource.pid !== null) {
    metrics.push({
      key: 'pid',
      label: translate('PID'),
      value: String(resource.pid),
    });
  }

  if (resource.port !== null) {
    metrics.push({
      key: 'port',
      label: translate('Port'),
      value: String(resource.port),
    });
  }

  if (resource.url) {
    metrics.push({
      key: 'url',
      label: translate('URL'),
      value: resource.url,
    });
  }

  return metrics;
}

function toViewModel(
  resource: AppResourceItem,
  translate: Translate
): AppResourceManagerItemViewModel {
  if (resource.kind === 'electron-process') {
    return {
      id: resource.id,
      title: resolveProcessTitle(resource, translate),
      subtitle: translate('{{type}} · PID {{pid}}', {
        type: resource.processType,
        pid: resource.pid,
      }),
      status: resolveStatusLabel(resource, translate),
      metrics: buildRuntimeMetrics(resource, translate),
      actions: resource.availableActions.map((action) => ({
        key: `${resource.id}:${action.kind}`,
        label: getActionLabel(action, resource, translate),
        dangerLevel: action.dangerLevel,
        request: toActionRequest(action, resource),
      })),
      resource,
    };
  }

  if (resource.kind === 'session') {
    return {
      id: resource.id,
      title: translate('{{kind}} session', {
        kind: resource.sessionKind === 'terminal' ? 'Terminal' : 'Agent',
      }),
      subtitle:
        resource.pid === null
          ? translate('{{backend}} backend', { backend: resource.backend })
          : translate('{{backend}} backend · PID {{pid}}', {
              backend: resource.backend,
              pid: resource.pid,
            }),
      status: resolveStatusLabel(resource, translate),
      metrics: buildSessionMetrics(resource, translate),
      actions: resource.availableActions.map((action) => ({
        key: `${resource.id}:${action.kind}`,
        label: getActionLabel(action, resource, translate),
        dangerLevel: action.dangerLevel,
        request: toActionRequest(action, resource),
      })),
      resource,
    };
  }

  return {
    id: resource.id,
    title: resolveServiceTitle(resource, translate),
    subtitle:
      resource.pid === null
        ? translate('{{service}} status', { service: resolveServiceTitle(resource, translate) })
        : translate('PID {{pid}}', { pid: resource.pid }),
    status: resolveStatusLabel(resource, translate),
    metrics: buildServiceMetrics(resource, translate),
    actions: resource.availableActions.map((action) => ({
      key: `${resource.id}:${action.kind}`,
      label: getActionLabel(action, resource, translate),
      dangerLevel: action.dangerLevel,
      request: toActionRequest(action, resource),
    })),
    resource,
  };
}

function sortItems(resources: AppResourceItem[]): AppResourceItem[] {
  return [...resources].sort((left, right) => {
    if (left.kind === 'electron-process' && right.kind === 'electron-process') {
      if (left.isCurrentRenderer !== right.isCurrentRenderer) {
        return left.isCurrentRenderer ? -1 : 1;
      }
      return right.workingSetSizeKb - left.workingSetSizeKb;
    }

    if (left.kind === 'session' && right.kind === 'session') {
      return right.createdAt - left.createdAt;
    }

    return left.id.localeCompare(right.id);
  });
}

function countReclaimableIdleLocalSessions(snapshot: AppResourceSnapshot): number {
  return snapshot.resources.reduce((count, resource) => {
    if (resource.kind !== 'session') {
      return count;
    }

    if (resource.backend !== 'local' || resource.isActive !== false) {
      return count;
    }

    return count + 1;
  }, 0);
}

export function buildAppResourceManagerSections(
  snapshot: AppResourceSnapshot,
  translate: Translate
): AppResourceManagerSectionViewModel[] {
  const groups: Array<{ key: AppResourceItem['group']; title: string }> = [
    { key: 'runtime', title: translate('Electron runtime') },
    { key: 'sessions', title: translate('Sessions') },
    { key: 'services', title: translate('Support services') },
  ];

  return groups
    .map((group) => ({
      key: group.key,
      title: group.title,
      items: sortItems(snapshot.resources.filter((resource) => resource.group === group.key)).map(
        (resource) => toViewModel(resource, translate)
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export function buildAppResourceManagerBulkActions(
  snapshot: AppResourceSnapshot,
  translate: Translate
): AppResourceManagerBulkActionViewModel[] {
  const reclaimableCount = countReclaimableIdleLocalSessions(snapshot);
  const description =
    reclaimableCount === 0
      ? translate('No idle local sessions are ready to reclaim.')
      : reclaimableCount === 1
        ? translate('1 idle local session can be reclaimed.')
        : translate('{{count}} idle local sessions can be reclaimed.', {
            count: reclaimableCount,
          });

  return [
    {
      key: 'batch:idle-sessions:reclaim',
      label: translate('Reclaim Idle Sessions'),
      description,
      disabled: reclaimableCount === 0,
      request: {
        kind: 'reclaim-idle-sessions',
        resourceId: 'batch:idle-sessions',
      },
    },
  ];
}

export function buildAppResourceActionConfirmation(
  action: AppResourceActionRequest,
  resource: AppResourceItem,
  translate: Translate
): AppResourceActionConfirmationCopy {
  switch (action.kind) {
    case 'terminate-process':
      return {
        title: translate('Force terminate process?'),
        description: translate(
          'This will forcibly terminate {{type}} (PID {{pid}}). Unsaved work in that process may be lost.',
          {
            type: resource.kind === 'electron-process' ? resource.processType : 'process',
            pid: action.pid,
          }
        ),
        confirmLabel: translate('Force Terminate'),
      };
    case 'reload-renderer':
      return {
        title: translate('Reload renderer?'),
        description: translate(
          'This will reload the current renderer. Unsaved in-memory UI state may be lost.'
        ),
        confirmLabel: translate('Reload Renderer'),
      };
    case 'kill-session':
      return {
        title: translate('Kill session?'),
        description: translate('This will terminate the selected session and its child processes.'),
        confirmLabel: translate('Kill Session'),
      };
    case 'stop-service':
      return {
        title: translate('Stop service?'),
        description: translate(
          'This will stop the selected background service for the current app runtime.'
        ),
        confirmLabel: translate('Stop Service'),
      };
    case 'reclaim-idle-sessions':
      return {
        title: translate('Reclaim idle sessions?'),
        description: translate(
          'This will terminate idle local sessions attached to the current app window.'
        ),
        confirmLabel: translate('Reclaim Idle Sessions'),
      };
  }
}
