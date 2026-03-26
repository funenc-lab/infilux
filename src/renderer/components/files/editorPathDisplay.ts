import { normalizePath } from '@/App/storage';
import { resolveFileListPath } from './breadcrumbPathUtils';

function recoverNestedAbsolutePath(targetPath: string): string {
  const normalizedPath = targetPath.replace(/\\/g, '/');
  const windowsAbsoluteMatch = normalizedPath.match(/\/\/([A-Za-z]:\/.*)$/);
  if (windowsAbsoluteMatch?.[1]) {
    return windowsAbsoluteMatch[1];
  }

  const unixAbsoluteMatch = normalizedPath.match(/\/\/([^/].*)$/);
  if (unixAbsoluteMatch?.[1]) {
    return `/${unixAbsoluteMatch[1]}`;
  }

  return targetPath;
}

export function getDisplayPathRelativeToRoot(targetPath: string, rootPath?: string): string {
  if (!rootPath) {
    return targetPath;
  }

  const resolvedPath = recoverNestedAbsolutePath(
    resolveFileListPath(targetPath, rootPath) ?? targetPath
  );
  const normalizedRootPath = normalizePath(rootPath);
  const normalizedResolvedPath = normalizePath(resolvedPath);

  if (normalizedResolvedPath === normalizedRootPath) {
    return resolvedPath;
  }

  if (!normalizedResolvedPath.startsWith(`${normalizedRootPath}/`)) {
    return resolvedPath;
  }

  return resolvedPath.slice(rootPath.length + 1);
}
