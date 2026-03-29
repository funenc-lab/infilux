export type AsyncTask<T> = () => Promise<T>;
export type AsyncTaskLimiter = <T>(task: AsyncTask<T>) => Promise<T>;

interface QueueEntry {
  run: () => void;
}

export const EDITOR_RELOAD_MAX_CONCURRENT_READS = 4;

export function createAsyncTaskLimiter(maxConcurrent: number): AsyncTaskLimiter {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error('maxConcurrent must be a positive integer');
  }

  const queue: QueueEntry[] = [];
  let activeCount = 0;

  const drainQueue = () => {
    while (activeCount < maxConcurrent && queue.length > 0) {
      const entry = queue.shift();
      if (!entry) {
        return;
      }

      activeCount += 1;
      entry.run();
    }
  };

  return <T>(task: AsyncTask<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push({
        run: () => {
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              activeCount -= 1;
              drainQueue();
            });
        },
      });
      drainQueue();
    });
}

const editorReloadLimiter = createAsyncTaskLimiter(EDITOR_RELOAD_MAX_CONCURRENT_READS);

export function runEditorReloadTask<T>(task: AsyncTask<T>): Promise<T> {
  return editorReloadLimiter(task);
}
