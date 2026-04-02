import { isRemoteVirtualPath, parseRemoteVirtualPath } from './remotePath';

/**
 * Path utility functions
 * For cross-platform path normalization
 */

/**
 * WSL UNC path prefixes used across renderer/main.
 * Keep this as the single source of truth for WSL UNC detection rules.
 */
export const WSL_UNC_PREFIXES = ['//wsl.localhost/', '//wsl$/'] as const;
const LIKELY_UNIX_ABSOLUTE_ROOT_SEGMENTS = new Set([
  'Applications',
  'Library',
  'System',
  'Users',
  'Volumes',
  'etc',
  'home',
  'mnt',
  'opt',
  'private',
  'srv',
  'tmp',
  'usr',
  'var',
]);

/**
 * Normalize path separators to forward slashes
 * @param p Original path
 * @returns Normalized path
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function recoverPrefixedAbsoluteTail(normalizedTail: string): string | undefined {
  const windowsAbsoluteMatch = normalizedTail.match(/^\/+([A-Za-z]:\/.*)$/);
  if (windowsAbsoluteMatch?.[1]) {
    return windowsAbsoluteMatch[1];
  }

  if (!normalizedTail.startsWith('//')) {
    return undefined;
  }

  const candidatePath = `/${normalizedTail.replace(/^\/+/, '')}`;
  const firstSegment = candidatePath.split('/').filter(Boolean)[0];
  if (!firstSegment || !LIKELY_UNIX_ABSOLUTE_ROOT_SEGMENTS.has(firstSegment)) {
    return undefined;
  }

  return candidatePath;
}

/**
 * Recover an absolute path that was accidentally prefixed by another root path.
 * This happens when a nested absolute path is persisted or reconstructed as
 * "<root>//Users/..." or "<root>/C:/...".
 * @param inputPath Possibly prefixed path
 * @param rootPath Optional trusted root prefix used for precise recovery
 * @returns Recovered absolute path when a known malformed shape is detected
 */
export function recoverPrefixedAbsolutePath(
  inputPath: string | undefined,
  rootPath?: string | undefined
): string | undefined {
  if (!inputPath) {
    return inputPath;
  }

  const normalizedInputPath = normalizePath(inputPath);

  if (rootPath) {
    const normalizedRootPath = normalizePath(trimTrailingPathSeparators(rootPath));
    if (
      normalizedInputPath !== normalizedRootPath &&
      normalizedInputPath.startsWith(normalizedRootPath)
    ) {
      const recoveredFromRoot = recoverPrefixedAbsoluteTail(
        normalizedInputPath.slice(normalizedRootPath.length)
      );
      if (recoveredFromRoot) {
        return recoveredFromRoot;
      }
    }
  }

  if (normalizedInputPath.startsWith('//')) {
    return inputPath;
  }

  const nestedWindowsAbsoluteMatch = normalizedInputPath.match(/^.+\/([A-Za-z]:\/.*)$/);
  if (nestedWindowsAbsoluteMatch?.[1]) {
    return nestedWindowsAbsoluteMatch[1];
  }

  const nestedUnixPrefixIndex = normalizedInputPath.indexOf('//', 1);
  if (nestedUnixPrefixIndex === -1) {
    return inputPath;
  }

  return recoverPrefixedAbsoluteTail(normalizedInputPath.slice(nestedUnixPrefixIndex)) ?? inputPath;
}

/**
 * Safely join path segments and normalize
 * Automatically handles extra slashes
 * @param segments Path segments to join
 * @returns Joined and normalized path
 */
export function joinPath(...segments: string[]): string {
  return segments.filter(Boolean).join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * Remove trailing path separators from a path string.
 * Preserves root paths like "/" and "C:\".
 * @param inputPath Original path
 * @returns Path without trailing separators
 */
export function trimTrailingPathSeparators(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (/^[a-zA-Z]:[\\/]?$/.test(inputPath)) return inputPath;

  const trimmed = inputPath.replace(/[\\/]+$/, '');
  return trimmed || inputPath;
}

/**
 * Whether path is a Windows WSL UNC path.
 * Supports both "\\wsl.localhost\..." and "//wsl.localhost/..." forms.
 * @param inputPath Original path
 * @returns True when path points to WSL via UNC prefix
 */
export function isWslUncPath(inputPath: string): boolean {
  const normalized = inputPath.replace(/\\/g, '/');
  return WSL_UNC_PREFIXES.some((prefix) => normalized.toLowerCase().startsWith(prefix));
}

/**
 * Get the final path segment from a filesystem path.
 * Handles both "/" and "\" separators and ignores trailing separators.
 * @param inputPath Original path
 * @returns Last segment or the original input when parsing fails
 */
export function getPathBasename(inputPath: string): string {
  const trimmed = trimTrailingPathSeparators(inputPath);
  if (!trimmed) return inputPath;
  const segments = trimmed.split(/[\\/]/);
  return segments[segments.length - 1] || inputPath;
}

/**
 * Convert an internal path into the value that should be shown to users.
 * Remote virtual paths are unwrapped back to their real remote filesystem path.
 * @param inputPath Original path
 * @returns User-facing path
 */
export function getDisplayPath(inputPath: string): string {
  const resolvedPath = (() => {
    if (!isRemoteVirtualPath(inputPath)) {
      return inputPath;
    }

    try {
      return parseRemoteVirtualPath(inputPath).remotePath;
    } catch {
      return inputPath;
    }
  })();

  return trimTrailingPathSeparators(resolvedPath);
}

/**
 * Get the final user-facing segment from a path.
 * @param inputPath Original path
 * @returns Last display segment
 */
export function getDisplayPathBasename(inputPath: string): string {
  return getPathBasename(getDisplayPath(inputPath));
}
