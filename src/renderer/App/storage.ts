import { buildRepositoryId, normalizeWorkspaceKey } from '@shared/utils/workspace';
import { normalizeHexColor } from '@/lib/colors';
import {
  ALL_GROUP_ID,
  DEFAULT_GROUP_COLOR,
  DEFAULT_TAB_ORDER,
  type RepositoryGroup,
  type TabId,
} from './constants';

// Storage keys
export const STORAGE_KEYS = {
  REPOSITORIES: 'enso-repositories',
  SELECTED_REPO: 'enso-selected-repo',
  REMOTE_PROFILES: 'enso-remote-profiles',
  ACTIVE_WORKTREE: 'enso-active-worktree', // deprecated, kept for migration
  ACTIVE_WORKTREES: 'enso-active-worktrees', // per-repo worktree map
  WORKTREE_TABS: 'enso-worktree-tabs',
  WORKTREE_ORDER: 'enso-worktree-order', // per-repo worktree display order map
  TAB_ORDER: 'enso-tab-order', // panel tab order
  REPOSITORY_WIDTH: 'enso-repository-width',
  WORKTREE_WIDTH: 'enso-worktree-width',
  FILE_SIDEBAR_WIDTH: 'enso-file-sidebar-width',
  TREE_SIDEBAR_WIDTH: 'enso-tree-sidebar-width',
  REPOSITORY_COLLAPSED: 'enso-repository-collapsed',
  WORKTREE_COLLAPSED: 'enso-worktree-collapsed',
  FILE_SIDEBAR_COLLAPSED: 'enso-file-sidebar-collapsed',
  REPOSITORY_SETTINGS: 'enso-repository-settings', // per-repo settings (init script, etc.)
  REPOSITORY_GROUPS: 'enso-repository-groups',
  ACTIVE_GROUP: 'enso-active-group',
  GROUP_COLLAPSED_STATE: 'enso-group-collapsed-state',
  TREE_SIDEBAR_EXPANDED_REPOS: 'enso-tree-sidebar-expanded-repos',
  TREE_SIDEBAR_TEMP_EXPANDED: 'enso-tree-sidebar-temp-expanded',
  TODO_BOARDS: 'enso-todo-boards',
  FILE_TREE_EXPANDED_PREFIX: 'enso-file-tree-expanded',
  SC_REPO_LIST_EXPANDED: 'enso-sc-repo-list-expanded',
  SC_CHANGES_EXPANDED: 'enso-sc-changes-expanded',
  SC_HISTORY_EXPANDED: 'enso-sc-history-expanded',
} as const;

const LEGACY_LOCAL_STORAGE_IMPORT_KEYS = new Set<string>([
  STORAGE_KEYS.REPOSITORIES,
  STORAGE_KEYS.SELECTED_REPO,
  STORAGE_KEYS.REMOTE_PROFILES,
  STORAGE_KEYS.ACTIVE_WORKTREE,
  STORAGE_KEYS.ACTIVE_WORKTREES,
  STORAGE_KEYS.WORKTREE_TABS,
  STORAGE_KEYS.WORKTREE_ORDER,
  STORAGE_KEYS.TAB_ORDER,
  STORAGE_KEYS.REPOSITORY_WIDTH,
  STORAGE_KEYS.WORKTREE_WIDTH,
  STORAGE_KEYS.FILE_SIDEBAR_WIDTH,
  STORAGE_KEYS.TREE_SIDEBAR_WIDTH,
  STORAGE_KEYS.REPOSITORY_COLLAPSED,
  STORAGE_KEYS.WORKTREE_COLLAPSED,
  STORAGE_KEYS.FILE_SIDEBAR_COLLAPSED,
  STORAGE_KEYS.REPOSITORY_SETTINGS,
  STORAGE_KEYS.REPOSITORY_GROUPS,
  STORAGE_KEYS.ACTIVE_GROUP,
  STORAGE_KEYS.GROUP_COLLAPSED_STATE,
  STORAGE_KEYS.TREE_SIDEBAR_EXPANDED_REPOS,
  STORAGE_KEYS.TREE_SIDEBAR_TEMP_EXPANDED,
  STORAGE_KEYS.SC_REPO_LIST_EXPANDED,
  STORAGE_KEYS.SC_CHANGES_EXPANDED,
  STORAGE_KEYS.SC_HISTORY_EXPANDED,
]);

const LEGACY_LOCAL_STORAGE_IMPORT_PREFIXES = [STORAGE_KEYS.FILE_TREE_EXPANDED_PREFIX];

function shouldImportLegacyLocalStorageKey(key: string): boolean {
  return (
    LEGACY_LOCAL_STORAGE_IMPORT_KEYS.has(key) ||
    LEGACY_LOCAL_STORAGE_IMPORT_PREFIXES.some((prefix) => key.startsWith(`${prefix}:`))
  );
}

export function filterManagedLocalStorageSnapshot(
  snapshot: Record<string, string>
): Record<string, string> {
  const filteredSnapshot: Record<string, string> = {};

  for (const [key, value] of Object.entries(snapshot)) {
    if (!shouldImportLegacyLocalStorageKey(key)) {
      continue;
    }

    filteredSnapshot[key] = value;
  }

  return filteredSnapshot;
}

export function getManagedLocalStorageSnapshot(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'> = localStorage
): Record<string, string> {
  const snapshot: Record<string, string> = {};

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !shouldImportLegacyLocalStorageKey(key)) {
      continue;
    }

    const value = storage.getItem(key);
    if (typeof value === 'string') {
      snapshot[key] = value;
    }
  }

  return snapshot;
}

export function hasManagedLocalStorageDifferences(
  currentSnapshot: Record<string, string>,
  nextSnapshot: Record<string, string>
): boolean {
  const filteredCurrentSnapshot = filterManagedLocalStorageSnapshot(currentSnapshot);
  const filteredNextSnapshot = filterManagedLocalStorageSnapshot(nextSnapshot);
  const keys = new Set([
    ...Object.keys(filteredCurrentSnapshot),
    ...Object.keys(filteredNextSnapshot),
  ]);

  for (const key of keys) {
    if (filteredCurrentSnapshot[key] !== filteredNextSnapshot[key]) {
      return true;
    }
  }

  return false;
}

export function hasManagedRepositoryState(snapshot: Record<string, string>): boolean {
  const repositories = snapshot[STORAGE_KEYS.REPOSITORIES];
  if (typeof repositories === 'string' && repositories !== '[]') {
    return true;
  }

  const selectedRepo = snapshot[STORAGE_KEYS.SELECTED_REPO];
  if (typeof selectedRepo === 'string' && selectedRepo.length > 0) {
    return true;
  }

  const worktreeTabs = snapshot[STORAGE_KEYS.WORKTREE_TABS];
  return typeof worktreeTabs === 'string' && worktreeTabs !== '{}';
}

export function shouldHydrateManagedLocalStorageFromSharedSnapshot(options: {
  currentSnapshot: Record<string, string>;
  sharedSnapshot: Record<string, string>;
  legacyLocalStorageMigrated: boolean;
}): boolean {
  const { currentSnapshot, sharedSnapshot, legacyLocalStorageMigrated } = options;

  if (Object.keys(sharedSnapshot).length === 0) {
    return false;
  }

  if (!hasManagedLocalStorageDifferences(currentSnapshot, sharedSnapshot)) {
    return false;
  }

  if (legacyLocalStorageMigrated) {
    return true;
  }

  return hasManagedRepositoryState(sharedSnapshot) && !hasManagedRepositoryState(currentSnapshot);
}

export function shouldSyncManagedLocalStorageToSharedSession(options: {
  currentSnapshot: Record<string, string>;
  sharedSnapshot: Record<string, string>;
}): boolean {
  const { currentSnapshot, sharedSnapshot } = options;

  if (Object.keys(currentSnapshot).length === 0) {
    return false;
  }

  if (hasManagedRepositoryState(sharedSnapshot) && !hasManagedRepositoryState(currentSnapshot)) {
    return false;
  }

  return hasManagedLocalStorageDifferences(sharedSnapshot, currentSnapshot);
}

export function applyImportedLegacyLocalStorageSnapshot(
  snapshot: Record<string, string>
): string[] {
  const appliedKeys: string[] = [];
  const filteredSnapshot = filterManagedLocalStorageSnapshot(snapshot);

  for (const [key, value] of Object.entries(filteredSnapshot)) {
    localStorage.setItem(key, value);
    appliedKeys.push(key);
  }

  return appliedKeys;
}

// Helper to get initial value from localStorage
export const getStoredNumber = (key: string, defaultValue: number): number => {
  const saved = localStorage.getItem(key);
  return saved ? Number(saved) : defaultValue;
};

export const getStoredBoolean = (key: string, defaultValue: boolean): boolean => {
  const saved = localStorage.getItem(key);
  return saved !== null ? saved === 'true' : defaultValue;
};

export const getStoredTabMap = (): Record<string, TabId> => {
  const saved = localStorage.getItem(STORAGE_KEYS.WORKTREE_TABS);
  if (saved) {
    try {
      return JSON.parse(saved) as Record<string, TabId>;
    } catch {
      return {};
    }
  }
  return {};
};

// Per-repo worktree map: { [repoPath]: worktreePath }
export const getStoredWorktreeMap = (): Record<string, string> => {
  const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKTREES);
  if (saved) {
    try {
      return JSON.parse(saved) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return {};
};

// Per-repo worktree order: { [repoPath]: { [worktreePath]: displayOrder } }
export const getStoredWorktreeOrderMap = (): Record<string, Record<string, number>> => {
  const saved = localStorage.getItem(STORAGE_KEYS.WORKTREE_ORDER);
  if (saved) {
    try {
      return JSON.parse(saved) as Record<string, Record<string, number>>;
    } catch {
      return {};
    }
  }
  return {};
};

export const saveWorktreeOrderMap = (orderMap: Record<string, Record<string, number>>): void => {
  localStorage.setItem(STORAGE_KEYS.WORKTREE_ORDER, JSON.stringify(orderMap));
};

// Panel tab order: array of TabId
const VALID_TAB_IDS = new Set<TabId>(DEFAULT_TAB_ORDER);

const normalizeTabOrder = (order: unknown): TabId[] => {
  if (!Array.isArray(order)) {
    return [...DEFAULT_TAB_ORDER];
  }

  const next: TabId[] = [];
  const seen = new Set<TabId>();

  for (const id of order) {
    if (typeof id === 'string' && VALID_TAB_IDS.has(id as TabId)) {
      const typedId = id as TabId;
      if (!seen.has(typedId)) {
        next.push(typedId);
        seen.add(typedId);
      }
    }
  }

  for (const id of DEFAULT_TAB_ORDER) {
    if (!seen.has(id)) {
      next.push(id);
    }
  }

  return next;
};

export const getStoredTabOrder = (): TabId[] => {
  const saved = localStorage.getItem(STORAGE_KEYS.TAB_ORDER);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as unknown;
      return normalizeTabOrder(parsed);
    } catch {
      // Return default order on error
    }
  }
  // Default order
  return [...DEFAULT_TAB_ORDER];
};

export const saveTabOrder = (order: TabId[]): void => {
  localStorage.setItem(STORAGE_KEYS.TAB_ORDER, JSON.stringify(normalizeTabOrder(order)));
};

// Get platform for path normalization
const getPlatform = (): string => {
  if (typeof navigator !== 'undefined') {
    const nav = navigator.platform;
    if (nav.startsWith('Win')) return 'win32';
    if (nav.startsWith('Mac')) return 'darwin';
  }
  return 'linux';
};

// Normalize path for comparison (handles case-insensitivity and trailing slashes)
export const normalizePath = (path: string): string => {
  // Remove trailing slashes/backslashes
  let normalized = path.replace(/[\\/]+$/, '');
  // On Windows and macOS, normalize to lowercase for case-insensitive comparison
  // Linux is case-sensitive, so we don't lowercase there
  const platform = getPlatform();
  if (platform === 'win32' || platform === 'darwin') {
    normalized = normalized.toLowerCase();
  }
  return normalized;
};

// Clean path for storage (only removes trailing slashes, preserves case)
// Use this when you need to store the original path but want consistent formatting
export const cleanPath = (path: string): string => {
  return path.replace(/[\\/]+$/, '');
};

export const normalizeWorkspacePathKey = (
  path: string,
  platform?: 'linux' | 'darwin' | 'win32'
): string => {
  const detectedPlatform =
    platform ??
    ((getPlatform() === 'win32' || getPlatform() === 'darwin' ? getPlatform() : 'linux') as
      | 'linux'
      | 'darwin'
      | 'win32');
  return normalizeWorkspaceKey(path, detectedPlatform);
};

export const ensureRepositoryId = <
  T extends { id?: string; path: string; kind?: 'local' | 'remote'; connectionId?: string },
>(
  repo: T
): T & { id: string } => {
  return {
    ...repo,
    id:
      repo.id ||
      buildRepositoryId(repo.kind ?? 'local', repo.path, {
        connectionId: repo.connectionId,
        platform:
          getPlatform() === 'win32' ? 'win32' : getPlatform() === 'darwin' ? 'darwin' : 'linux',
      }),
  };
};

// Check if two paths are equal (considering OS-specific rules)
export const pathsEqual = (path1: string, path2: string): boolean => {
  return normalizePath(path1) === normalizePath(path2);
};

// Repository settings types and helpers
export interface RepositorySettings {
  autoInitWorktree: boolean;
  initScript: string;
  hidden: boolean;
}

export const DEFAULT_REPOSITORY_SETTINGS: RepositorySettings = {
  autoInitWorktree: false,
  initScript: '',
  hidden: false,
};

export const getStoredRepositorySettings = (): Record<string, RepositorySettings> => {
  const saved = localStorage.getItem(STORAGE_KEYS.REPOSITORY_SETTINGS);
  if (saved) {
    try {
      return JSON.parse(saved) as Record<string, RepositorySettings>;
    } catch {
      return {};
    }
  }
  return {};
};

export const getRepositorySettings = (repoPath: string): RepositorySettings => {
  const allSettings = getStoredRepositorySettings();
  const normalizedPath = normalizeWorkspacePathKey(repoPath);
  return allSettings[normalizedPath] || DEFAULT_REPOSITORY_SETTINGS;
};

export const saveRepositorySettings = (repoPath: string, settings: RepositorySettings): void => {
  const allSettings = getStoredRepositorySettings();
  const normalizedPath = normalizeWorkspacePathKey(repoPath);
  allSettings[normalizedPath] = settings;
  localStorage.setItem(STORAGE_KEYS.REPOSITORY_SETTINGS, JSON.stringify(allSettings));
};

export const getStoredGroups = (): RepositoryGroup[] => {
  const saved = localStorage.getItem(STORAGE_KEYS.REPOSITORY_GROUPS);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as unknown;
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((raw, index) => {
          const group = raw as Partial<RepositoryGroup>;
          const color = normalizeHexColor(String(group.color ?? ''), DEFAULT_GROUP_COLOR);

          const id = typeof group.id === 'string' && group.id ? group.id : '';
          if (!id) return null;

          const parsedOrder = Number(group.order);
          const order = Number.isFinite(parsedOrder) ? parsedOrder : index;

          return {
            id,
            name: String(group.name ?? ''),
            emoji: typeof group.emoji === 'string' ? group.emoji : '',
            order,
            color,
          };
        })
        .filter((g): g is RepositoryGroup => !!g);
    } catch {
      return [];
    }
  }
  return [];
};

export const saveGroups = (groups: RepositoryGroup[]): void => {
  localStorage.setItem(STORAGE_KEYS.REPOSITORY_GROUPS, JSON.stringify(groups));
};

export const getActiveGroupId = (): string => {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_GROUP) || ALL_GROUP_ID;
};

export const saveActiveGroupId = (groupId: string): void => {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_GROUP, groupId);
};

export const migrateRepositoryGroups = (): void => {
  if (localStorage.getItem(STORAGE_KEYS.REPOSITORY_GROUPS) === null) {
    localStorage.setItem(STORAGE_KEYS.REPOSITORY_GROUPS, JSON.stringify([]));
  }
  if (localStorage.getItem(STORAGE_KEYS.ACTIVE_GROUP) === null) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_GROUP, ALL_GROUP_ID);
  }
};

export const getStoredGroupCollapsedState = (): Record<string, boolean> => {
  const saved = localStorage.getItem(STORAGE_KEYS.GROUP_COLLAPSED_STATE);
  if (saved) {
    try {
      return JSON.parse(saved) as Record<string, boolean>;
    } catch {
      return {};
    }
  }
  return {};
};

export const saveGroupCollapsedState = (state: Record<string, boolean>): void => {
  localStorage.setItem(STORAGE_KEYS.GROUP_COLLAPSED_STATE, JSON.stringify(state));
};

export const getStoredTreeSidebarExpandedRepos = (): string[] => {
  const saved = localStorage.getItem(STORAGE_KEYS.TREE_SIDEBAR_EXPANDED_REPOS);
  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [
      ...new Set(
        parsed.filter((value): value is string => typeof value === 'string').map(normalizePath)
      ),
    ];
  } catch {
    return [];
  }
};

export const saveTreeSidebarExpandedRepos = (repoPaths: string[]): void => {
  localStorage.setItem(
    STORAGE_KEYS.TREE_SIDEBAR_EXPANDED_REPOS,
    JSON.stringify([...new Set(repoPaths.map(normalizePath))])
  );
};

export const getStoredTreeSidebarTempExpanded = (): boolean =>
  getStoredBoolean(STORAGE_KEYS.TREE_SIDEBAR_TEMP_EXPANDED, true);

export const saveTreeSidebarTempExpanded = (expanded: boolean): void => {
  localStorage.setItem(STORAGE_KEYS.TREE_SIDEBAR_TEMP_EXPANDED, String(expanded));
};

// File tree expanded paths helpers (per-worktree, keyed by rootPath)
const getFileTreeExpandedKey = (rootPath: string): string =>
  `${STORAGE_KEYS.FILE_TREE_EXPANDED_PREFIX}:${normalizePath(rootPath)}`;

export const loadFileTreeExpandedPaths = (rootPath: string): Set<string> => {
  try {
    const raw = localStorage.getItem(getFileTreeExpandedKey(rootPath));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
};

export const saveFileTreeExpandedPaths = (rootPath: string, paths: Set<string>): void => {
  try {
    localStorage.setItem(getFileTreeExpandedKey(rootPath), JSON.stringify([...paths]));
  } catch {
    // Silently ignore storage errors (e.g. private mode / quota exceeded)
  }
};
