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

export function markStartupBlockingKeyReady(
  pendingKeys: StartupBlockingKey[],
  key: StartupBlockingKey
): StartupBlockingKey[] {
  if (!pendingKeys.includes(key)) {
    return pendingKeys;
  }

  return pendingKeys.filter((candidate) => candidate !== key);
}
