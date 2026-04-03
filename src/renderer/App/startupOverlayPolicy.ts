import type { TabId } from './constants';

export type StartupBlockingKey =
  | 'chat-panel'
  | 'file-panel'
  | 'repository-sidebar'
  | 'settings-panel'
  | 'source-control-panel'
  | 'terminal-panel'
  | 'todo-panel'
  | 'tree-sidebar'
  | 'worktree-panel';

export interface StartupBlockingCopy {
  description: string;
  title: string;
}

export interface StartupProgressState {
  completedCount: number;
  currentKey: StartupBlockingKey | null;
  currentStep: number;
  totalSteps: number;
}

interface ResolveInitialStartupBlockingKeysOptions {
  layoutMode: 'columns' | 'tree';
  repositoryCollapsed: boolean;
  worktreeCollapsed: boolean;
  isTempRepo: boolean;
  activeTab: TabId;
  hasActiveWorktree: boolean;
  hasSelectedSubagent: boolean;
  settingsDisplayMode: 'tab' | 'draggable-modal';
}

interface ResolveStartupProgressOptions {
  pendingKeys: StartupBlockingKey[];
  totalKeys: number;
}

const STARTUP_BLOCKING_COPY: Record<StartupBlockingKey, StartupBlockingCopy> = {
  'chat-panel': {
    title: 'Loading AI Agent',
    description: 'Preparing agent sessions and terminal workspace',
  },
  'file-panel': {
    title: 'Loading editor',
    description: 'Preparing active file workspace',
  },
  'repository-sidebar': {
    title: 'Loading repositories',
    description: 'Preparing repository groups and recent workspace state',
  },
  'settings-panel': {
    title: 'Loading settings',
    description: 'Preparing preferences and configuration panels',
  },
  'source-control-panel': {
    title: 'Loading version control',
    description: 'Preparing repository status and diff tools',
  },
  'terminal-panel': {
    title: 'Loading terminal',
    description: 'Preparing shell sessions and terminal workspace',
  },
  'todo-panel': {
    title: 'Loading tasks',
    description: 'Preparing the kanban board',
  },
  'tree-sidebar': {
    title: 'Loading workspace tree',
    description: 'Preparing repositories, worktrees, and activity indicators',
  },
  'worktree-panel': {
    title: 'Loading worktrees',
    description: 'Preparing branches, worktree status, and session context',
  },
};

export function resolveInitialStartupBlockingKeys({
  layoutMode,
  repositoryCollapsed,
  worktreeCollapsed,
  isTempRepo,
  activeTab,
  hasActiveWorktree,
  hasSelectedSubagent,
  settingsDisplayMode,
}: ResolveInitialStartupBlockingKeysOptions): StartupBlockingKey[] {
  const keys: StartupBlockingKey[] = [];

  if (!repositoryCollapsed) {
    keys.push(layoutMode === 'tree' ? 'tree-sidebar' : 'repository-sidebar');
  }

  if (layoutMode === 'columns' && !worktreeCollapsed && !isTempRepo) {
    keys.push('worktree-panel');
  }

  if (activeTab === 'settings') {
    if (settingsDisplayMode === 'tab') {
      keys.push('settings-panel');
    }
    return keys;
  }

  if (!hasActiveWorktree) {
    return keys;
  }

  switch (activeTab) {
    case 'chat':
      if (!hasSelectedSubagent) {
        keys.push('chat-panel');
      }
      break;
    case 'file':
      keys.push('file-panel');
      break;
    case 'terminal':
      keys.push('terminal-panel');
      break;
    case 'source-control':
      keys.push('source-control-panel');
      break;
    case 'todo':
      keys.push('todo-panel');
      break;
    default:
      break;
  }

  return keys;
}

export function resolveStartupBlockingCopy(key: StartupBlockingKey): StartupBlockingCopy {
  return STARTUP_BLOCKING_COPY[key];
}

export function resolveStartupProgress({
  pendingKeys,
  totalKeys,
}: ResolveStartupProgressOptions): StartupProgressState {
  const totalSteps = Math.max(totalKeys, pendingKeys.length, 1);
  const currentKey = pendingKeys[0] ?? null;
  const completedCount = Math.min(Math.max(totalSteps - pendingKeys.length, 0), totalSteps);
  const currentStep =
    pendingKeys.length === 0 ? totalSteps : Math.min(completedCount + 1, totalSteps);

  return {
    completedCount,
    currentKey,
    currentStep,
    totalSteps,
  };
}

export function markStartupBlockingKeyReady(
  pendingKeys: StartupBlockingKey[],
  key: StartupBlockingKey
): StartupBlockingKey[] {
  if (!pendingKeys.includes(key)) {
    return pendingKeys;
  }

  return pendingKeys.filter((candidate) => candidate !== key);
}
