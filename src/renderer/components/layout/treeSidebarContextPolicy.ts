import { ALL_GROUP_ID, type Repository, TEMP_REPO_ID } from '@/App/constants';
import { normalizePath } from '@/App/storage';

interface TreeSidebarContextTransitionInput {
  previousContextKey: string | null;
  selectedRepo: string | null;
  activeWorktreePath: string | null;
  selectedRepository: Repository | null;
  expandedRepoPaths: readonly string[];
  activeGroupId: string;
}

interface TreeSidebarContextTransitionResult {
  contextKey: string | null;
  contextChanged: boolean;
  expandedRepoPaths: string[];
  groupIdToSelect: string | null;
}

export function resolveTreeSidebarContextTransition({
  previousContextKey,
  selectedRepo,
  activeWorktreePath,
  selectedRepository,
  expandedRepoPaths,
  activeGroupId,
}: TreeSidebarContextTransitionInput): TreeSidebarContextTransitionResult {
  if (!selectedRepo || selectedRepo === TEMP_REPO_ID) {
    return {
      contextKey: selectedRepo,
      contextChanged: selectedRepo !== previousContextKey,
      expandedRepoPaths: [...expandedRepoPaths],
      groupIdToSelect: null,
    };
  }

  const normalizedSelectedRepo = normalizePath(selectedRepo);
  const normalizedWorktreePath = activeWorktreePath ? normalizePath(activeWorktreePath) : '';
  const contextKey = `${normalizedSelectedRepo}\u0000${normalizedWorktreePath}`;
  const contextChanged = contextKey !== previousContextKey;

  if (!contextChanged) {
    return {
      contextKey,
      contextChanged: false,
      expandedRepoPaths: [...expandedRepoPaths],
      groupIdToSelect: null,
    };
  }

  const expandedPathSet = new Set(expandedRepoPaths.map(normalizePath));
  const nextExpandedRepoPaths = expandedPathSet.has(normalizedSelectedRepo)
    ? [...expandedRepoPaths]
    : [...expandedRepoPaths, normalizedSelectedRepo];
  const selectedRepositoryMatches =
    selectedRepository && normalizePath(selectedRepository.path) === normalizedSelectedRepo;
  const selectedRepositoryGroupId = selectedRepositoryMatches
    ? (selectedRepository.groupId ?? ALL_GROUP_ID)
    : null;
  const groupIdToSelect =
    activeGroupId !== ALL_GROUP_ID &&
    selectedRepositoryGroupId !== null &&
    selectedRepositoryGroupId !== activeGroupId
      ? selectedRepositoryGroupId
      : null;

  return {
    contextKey,
    contextChanged: true,
    expandedRepoPaths: nextExpandedRepoPaths,
    groupIdToSelect,
  };
}
