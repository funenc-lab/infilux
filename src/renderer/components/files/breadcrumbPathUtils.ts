export interface BreadcrumbSegment {
  name: string;
  path: string;
  isLast: boolean;
}

function trimTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/, '');
}

function isWindowsStylePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\/.test(path);
}

function usesCaseInsensitiveComparison(path: string): boolean {
  if (isWindowsStylePath(path)) {
    return true;
  }

  if (typeof navigator === 'undefined') {
    return false;
  }

  return /\b(mac|darwin|win)\b/i.test(navigator.userAgent);
}

function normalizeComparisonPath(path: string): string {
  const trimmed = trimTrailingSeparators(path).replace(/\\/g, '/');
  return usesCaseInsensitiveComparison(path) ? trimmed.toLowerCase() : trimmed;
}

function recoverNestedAbsolutePath(
  path: string | undefined,
  rootPath: string | undefined
): string | undefined {
  if (!path) {
    return path;
  }

  if (!rootPath) {
    return path;
  }

  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedRoot = trimTrailingSeparators(rootPath).replace(/\\/g, '/');

  if (!normalizedPath.startsWith(normalizedRoot)) {
    return path;
  }

  const remainder = normalizedPath.slice(normalizedRoot.length);
  if (remainder.startsWith('//')) {
    return `/${remainder.replace(/^\/+/, '')}`;
  }

  const windowsAbsoluteMatch = remainder.match(/^[/\\]+([A-Za-z]:[/\\].*)$/);
  if (windowsAbsoluteMatch?.[1]) {
    return windowsAbsoluteMatch[1];
  }

  return path;
}

function isPathInsideRoot(path: string, rootPath: string): boolean {
  const normalizedPath = normalizeComparisonPath(path);
  const normalizedRoot = normalizeComparisonPath(rootPath);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function buildAbsoluteSegments(path: string): BreadcrumbSegment[] {
  const normalizedPath = path.replace(/\\/g, '/');
  const prefix = normalizedPath.startsWith('//') ? '//' : normalizedPath.startsWith('/') ? '/' : '';
  const trimmedPath = normalizedPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmedPath) {
    return [];
  }

  const parts = trimmedPath.split('/').filter(Boolean);
  return parts.map((name, index) => ({
    name,
    path: `${prefix}${parts.slice(0, index + 1).join('/')}`,
    isLast: index === parts.length - 1,
  }));
}

export function buildBreadcrumbSegments(
  activeTabPath: string | null,
  rootPath: string | undefined
): BreadcrumbSegment[] {
  if (!activeTabPath || !rootPath) {
    return [];
  }

  const resolvedPath = recoverNestedAbsolutePath(activeTabPath, rootPath) ?? activeTabPath;

  if (!isPathInsideRoot(resolvedPath, rootPath)) {
    return buildAbsoluteSegments(resolvedPath);
  }

  const cleanedRootPath = trimTrailingSeparators(rootPath);
  const relativePath = resolvedPath
    .slice(cleanedRootPath.length)
    .replace(/^[\\/]+/, '')
    .replace(/[\\/]+$/, '');

  if (!relativePath) {
    return [];
  }

  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  return parts.map((name, index) => ({
    name,
    path: `${cleanedRootPath}/${parts.slice(0, index + 1).join('/')}`,
    isLast: index === parts.length - 1,
  }));
}

export function resolveBreadcrumbGitRoot(
  targetPath: string | undefined,
  rootPath: string | undefined
): string | undefined {
  return resolveFileListGitRoot(targetPath, rootPath);
}

export function resolveFileListPath(
  targetPath: string | undefined,
  rootPath: string | undefined
): string | undefined {
  return recoverNestedAbsolutePath(targetPath, rootPath) ?? targetPath;
}

export function resolveFileListGitRoot(
  targetPath: string | undefined,
  rootPath: string | undefined
): string | undefined {
  const resolvedPath = resolveFileListPath(targetPath, rootPath);

  if (!resolvedPath || !rootPath) {
    return undefined;
  }

  return isPathInsideRoot(resolvedPath, rootPath) ? rootPath : undefined;
}
