import type { ValidateLocalPathResult } from '@shared/types';

export type LocalRepositoryAddState =
  | 'empty'
  | 'validating'
  | 'missing'
  | 'file'
  | 'initializable'
  | 'ready';

export function resolveLocalRepositoryAddState(
  localPath: string,
  pathValidation: ValidateLocalPathResult | null,
  isValidating: boolean
): LocalRepositoryAddState {
  if (isValidating) {
    return 'validating';
  }
  if (!localPath.trim()) {
    return 'empty';
  }
  if (!pathValidation) {
    return 'empty';
  }
  if (!pathValidation.exists) {
    return 'missing';
  }
  if (!pathValidation.isDirectory) {
    return 'file';
  }
  return pathValidation.isGitRepository ? 'ready' : 'initializable';
}

export function canSubmitLocalRepository(state: LocalRepositoryAddState): boolean {
  return state === 'ready' || state === 'initializable';
}

export function canInitializeLocalRepository(state: LocalRepositoryAddState): boolean {
  return state === 'initializable';
}
