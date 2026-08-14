import type { ClaudePolicyCatalogRequest } from '@shared/types';
import { useEffect, useRef } from 'react';

function normalizeCatalogPath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

export function doesCatalogInvalidationAffectRequest(
  request: ClaudePolicyCatalogRequest | undefined,
  invalidation: ClaudePolicyCatalogRequest
): boolean {
  const invalidatedPaths = [
    normalizeCatalogPath(invalidation.repoPath),
    normalizeCatalogPath(invalidation.worktreePath),
  ].filter((path): path is string => Boolean(path));
  if (invalidatedPaths.length === 0) {
    return true;
  }

  const requestPaths = [
    normalizeCatalogPath(request?.repoPath),
    normalizeCatalogPath(request?.worktreePath),
  ];
  return requestPaths.some(
    (requestPath) => requestPath !== undefined && invalidatedPaths.includes(requestPath)
  );
}

export function useClaudeCapabilityCatalogInvalidation(
  request: ClaudePolicyCatalogRequest | undefined,
  enabled: boolean,
  onInvalidated: () => void
): void {
  const requestRef = useRef(request);
  const onInvalidatedRef = useRef(onInvalidated);
  requestRef.current = request;
  onInvalidatedRef.current = onInvalidated;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const subscribe = window.electronAPI?.claudePolicy?.catalog?.onInvalidated;
    if (!subscribe) {
      return;
    }
    return subscribe((invalidation) => {
      if (doesCatalogInvalidationAffectRequest(requestRef.current, invalidation)) {
        onInvalidatedRef.current();
      }
    });
  }, [enabled]);
}
