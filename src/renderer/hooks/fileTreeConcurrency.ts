export const FILE_TREE_REQUEST_CONCURRENCY = 4;

function getPathDepth(path: string): number {
  return path.split(/[\\/]+/).filter(Boolean).length;
}

export function buildFileTreeRestoreBatches(paths: readonly string[]): string[][] {
  const pathsByDepth = new Map<number, string[]>();

  for (const path of new Set(paths.filter(Boolean))) {
    const depth = getPathDepth(path);
    const batch = pathsByDepth.get(depth) ?? [];
    batch.push(path);
    pathsByDepth.set(depth, batch);
  }

  return [...pathsByDepth.entries()]
    .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth)
    .map(([, batch]) => batch);
}

export async function mapFileTreeRequestsWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  mapper: (item: TInput) => Promise<TOutput>,
  limit = FILE_TREE_REQUEST_CONCURRENCY
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
