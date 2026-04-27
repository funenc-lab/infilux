import type { ClaudeCapabilityCatalogItem } from '@shared/types';

export function getCapabilitySourcePaths(item: {
  sourcePath?: ClaudeCapabilityCatalogItem['sourcePath'];
  sourcePaths?: ClaudeCapabilityCatalogItem['sourcePaths'];
}): string[] {
  return [
    ...new Set([...(item.sourcePaths ?? []), ...(item.sourcePath ? [item.sourcePath] : [])]),
  ].sort((left, right) => left.localeCompare(right));
}
