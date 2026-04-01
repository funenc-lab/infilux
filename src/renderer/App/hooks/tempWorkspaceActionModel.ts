interface TempWorkspaceSummary {
  id: string;
  path: string;
}

export function selectNextTempWorkspacePath(
  items: TempWorkspaceSummary[],
  removedId: string
): string | null {
  if (!items.some((item) => item.id === removedId)) {
    return null;
  }

  const remaining = items.filter((item) => item.id !== removedId);
  return remaining[0]?.path ?? null;
}
