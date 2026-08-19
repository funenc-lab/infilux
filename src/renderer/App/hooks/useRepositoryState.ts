import { getDisplayPathBasename } from '@shared/utils/path';
import { buildRepositoryId } from '@shared/utils/workspace';
import { useCallback, useEffect, useState } from 'react';
import { normalizeHexColor } from '@/lib/colors';
import {
  ALL_GROUP_ID,
  DEFAULT_GROUP_COLOR,
  generateGroupId,
  type Repository,
  type RepositoryGroup,
} from '../constants';
import { normalizeRepositoryLastAccessedAt, touchRepositoryAccess } from '../repositoryAccess';
import {
  ensureRepositoryId,
  getActiveGroupId,
  getStoredGroups,
  migrateRepositoryGroups,
  pathsEqual,
  STORAGE_KEYS,
  saveActiveGroupId,
  saveGroups,
  scheduleManagedLocalStorageSync,
} from '../storage';
import { resolveActiveGroupId } from './activeGroupPolicy';

export function useRepositoryState() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepoState] = useState<string | null>(null);
  const [groups, setGroups] = useState<RepositoryGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>(ALL_GROUP_ID);

  // Initialize repositories and groups from localStorage
  useEffect(() => {
    migrateRepositoryGroups();

    const savedGroups = getStoredGroups();
    const storedActiveGroupId = getActiveGroupId();
    const nextActiveGroupId = resolveActiveGroupId({
      hideGroups: false,
      activeGroupId: storedActiveGroupId,
      groups: savedGroups,
    });

    setGroups(savedGroups);
    setActiveGroupId(nextActiveGroupId);
    if (nextActiveGroupId !== storedActiveGroupId) {
      saveActiveGroupId(nextActiveGroupId);
    }

    const validGroupIds = new Set(savedGroups.map((g) => g.id));

    const savedSelectedRepo = localStorage.getItem(STORAGE_KEYS.SELECTED_REPO);
    const savedRepos = localStorage.getItem(STORAGE_KEYS.REPOSITORIES);
    if (savedRepos) {
      try {
        let parsed = JSON.parse(savedRepos) as Repository[];
        let needsMigration = false;
        parsed = parsed.map((repo) => {
          let normalizedRepository = ensureRepositoryId(repo);
          if (normalizedRepository.id !== repo.id) {
            needsMigration = true;
          }
          if (repo.name.includes('/') || repo.name.includes('\\')) {
            needsMigration = true;
            normalizedRepository = {
              ...normalizedRepository,
              name: getDisplayPathBasename(repo.path),
            };
          }
          if (normalizedRepository.groupId && !validGroupIds.has(normalizedRepository.groupId)) {
            needsMigration = true;
            normalizedRepository = { ...normalizedRepository, groupId: undefined };
          }
          const normalizedLastAccessedAt = normalizeRepositoryLastAccessedAt(
            normalizedRepository.lastAccessedAt
          );
          if (normalizedLastAccessedAt !== normalizedRepository.lastAccessedAt) {
            needsMigration = true;
            normalizedRepository = {
              ...normalizedRepository,
              lastAccessedAt: normalizedLastAccessedAt,
            };
          }
          return normalizedRepository;
        });
        if (savedSelectedRepo) {
          const restored = touchRepositoryAccess(parsed, savedSelectedRepo, Date.now());
          if (restored !== parsed) {
            parsed = restored;
            needsMigration = true;
          }
        }
        if (needsMigration) {
          localStorage.setItem(STORAGE_KEYS.REPOSITORIES, JSON.stringify(parsed));
          scheduleManagedLocalStorageSync({ allowEmptyRepositoryState: true });
        }
        setRepositories(parsed);
      } catch {
        // ignore
      }
    }

    if (savedSelectedRepo) {
      setSelectedRepoState(savedSelectedRepo);
    }
  }, []);

  // Save repositories to localStorage
  const saveRepositories = useCallback((repos: Repository[]) => {
    localStorage.setItem(STORAGE_KEYS.REPOSITORIES, JSON.stringify(repos));
    scheduleManagedLocalStorageSync({ allowEmptyRepositoryState: true });
    setRepositories(repos);
  }, []);

  const setSelectedRepo = useCallback((repositoryPath: string | null) => {
    if (repositoryPath) {
      setRepositories((currentRepositories) => {
        const updated = touchRepositoryAccess(currentRepositories, repositoryPath, Date.now());
        if (updated === currentRepositories) {
          return currentRepositories;
        }

        localStorage.setItem(STORAGE_KEYS.REPOSITORIES, JSON.stringify(updated));
        scheduleManagedLocalStorageSync({ allowEmptyRepositoryState: true });
        return updated;
      });
    }

    setSelectedRepoState(repositoryPath);
  }, []);

  // Save selected repo to localStorage
  useEffect(() => {
    if (selectedRepo) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_REPO, selectedRepo);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_REPO);
    }
    scheduleManagedLocalStorageSync({ allowEmptyRepositoryState: true });
  }, [selectedRepo]);

  // Group management
  const handleCreateGroup = useCallback(
    (name: string, emoji: string, color: string) => {
      const normalizedColor = normalizeHexColor(color, DEFAULT_GROUP_COLOR);
      const newGroup: RepositoryGroup = {
        id: generateGroupId(),
        name: name.trim(),
        emoji,
        color: normalizedColor,
        order: groups.length,
      };
      const updated = [...groups, newGroup];
      setGroups(updated);
      saveGroups(updated);
      return newGroup;
    },
    [groups]
  );

  const handleUpdateGroup = useCallback(
    (groupId: string, name: string, emoji: string, color: string) => {
      const normalizedColor = normalizeHexColor(color, DEFAULT_GROUP_COLOR);
      const updated = groups.map((g) =>
        g.id === groupId ? { ...g, name: name.trim(), emoji, color: normalizedColor } : g
      );
      setGroups(updated);
      saveGroups(updated);
    },
    [groups]
  );

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      const updatedGroups = groups
        .filter((g) => g.id !== groupId)
        .map((g, i) => ({ ...g, order: i }));
      setGroups(updatedGroups);
      saveGroups(updatedGroups);

      const updatedRepos = repositories.map((r) =>
        r.groupId === groupId ? { ...r, groupId: undefined } : r
      );
      saveRepositories(updatedRepos);

      if (activeGroupId === groupId) {
        setActiveGroupId(ALL_GROUP_ID);
        saveActiveGroupId(ALL_GROUP_ID);
      }
    },
    [groups, repositories, saveRepositories, activeGroupId]
  );

  const handleSwitchGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    saveActiveGroupId(groupId);
  }, []);

  const handleMoveToGroup = useCallback(
    (repoIdentifier: string, targetGroupId: string | null) => {
      const updated = repositories.map((r) =>
        r.id === repoIdentifier || pathsEqual(r.path, repoIdentifier)
          ? { ...r, groupId: targetGroupId || undefined }
          : r
      );
      saveRepositories(updated);
    },
    [repositories, saveRepositories]
  );

  // Repository management
  const handleAddRepository = useCallback(
    (
      path: string,
      groupId: string | null = null,
      options?: { kind?: 'local' | 'remote'; connectionId?: string }
    ) => {
      const id = buildRepositoryId(options?.kind ?? 'local', path, {
        connectionId: options?.connectionId,
        platform:
          window.electronAPI?.env?.platform === 'win32'
            ? 'win32'
            : window.electronAPI?.env?.platform === 'darwin'
              ? 'darwin'
              : 'linux',
      });
      if (
        repositories.some(
          (r) =>
            r.id === id ||
            (r.kind !== 'remote' && options?.kind !== 'remote' && pathsEqual(r.path, path))
        )
      ) {
        const existingRepo = repositories.find(
          (r) =>
            r.id === id ||
            (r.kind !== 'remote' && options?.kind !== 'remote' && pathsEqual(r.path, path))
        );
        setSelectedRepo(existingRepo?.path ?? path);
        return;
      }

      const name = getDisplayPathBasename(path);
      const newRepo: Repository = {
        id,
        name,
        path,
        kind: options?.kind ?? 'local',
        connectionId: options?.connectionId,
        groupId: groupId || undefined,
        lastAccessedAt: Date.now(),
      };

      const updated = [...repositories, newRepo];
      saveRepositories(updated);
      setSelectedRepoState(path);
    },
    [repositories, saveRepositories, setSelectedRepo]
  );

  const handleReorderRepositories = useCallback(
    (fromIndex: number, toIndex: number) => {
      const reordered = [...repositories];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      saveRepositories(reordered);
    },
    [repositories, saveRepositories]
  );

  return {
    repositories,
    selectedRepo,
    groups,
    activeGroupId,
    setSelectedRepo,
    setActiveGroupId,
    saveRepositories,
    handleCreateGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleSwitchGroup,
    handleMoveToGroup,
    handleAddRepository,
    handleReorderRepositories,
  };
}
