import { ALL_GROUP_ID, type RepositoryGroup } from '../constants';

interface ResolveActiveGroupIdParams {
  hideGroups: boolean;
  activeGroupId: string | null | undefined;
  groups: RepositoryGroup[];
}

export function resolveActiveGroupId({
  hideGroups,
  activeGroupId,
  groups,
}: ResolveActiveGroupIdParams): string {
  if (hideGroups) {
    return ALL_GROUP_ID;
  }

  if (!activeGroupId || activeGroupId === ALL_GROUP_ID) {
    return ALL_GROUP_ID;
  }

  return groups.some((group) => group.id === activeGroupId) ? activeGroupId : ALL_GROUP_ID;
}
