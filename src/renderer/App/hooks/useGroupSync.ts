import { useEffect } from 'react';
import type { RepositoryGroup } from '../constants';
import { resolveActiveGroupId } from './activeGroupPolicy';

export function useGroupSync(
  hideGroups: boolean,
  activeGroupId: string,
  groups: RepositoryGroup[],
  setActiveGroupId: (id: string) => void,
  saveActiveGroupId: (id: string) => void
) {
  useEffect(() => {
    const nextActiveGroupId = resolveActiveGroupId({
      hideGroups,
      activeGroupId,
      groups,
    });

    if (nextActiveGroupId !== activeGroupId) {
      setActiveGroupId(nextActiveGroupId);
      saveActiveGroupId(nextActiveGroupId);
    }
  }, [hideGroups, activeGroupId, groups, setActiveGroupId, saveActiveGroupId]);
}
