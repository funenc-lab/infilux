export type StartupTimelineSource = 'main' | 'renderer';

export interface StartupTimelineEntry {
  source: StartupTimelineSource;
  stage: string;
  timestampMs: number;
  sincePreviousMs: number;
  sinceStartMs: number;
}

export interface StartupTimelineRecorder {
  getEntries: () => StartupTimelineEntry[];
  markStage: (stage: string) => StartupTimelineEntry;
}

export function createStartupTimelineRecorder(
  source: StartupTimelineSource,
  now: () => number = () => Date.now()
): StartupTimelineRecorder {
  const entries: StartupTimelineEntry[] = [];

  return {
    markStage(stage: string) {
      const timestampMs = now();
      const previousEntry = entries.at(-1);
      const firstTimestampMs = entries[0]?.timestampMs ?? timestampMs;
      const entry: StartupTimelineEntry = {
        source,
        stage,
        timestampMs,
        sincePreviousMs: previousEntry ? timestampMs - previousEntry.timestampMs : 0,
        sinceStartMs: timestampMs - firstTimestampMs,
      };
      entries.push(entry);
      return entry;
    },
    getEntries() {
      return entries.map((entry) => ({ ...entry }));
    },
  };
}

export function formatStartupTimelineEntry(entry: StartupTimelineEntry): string {
  return `[startup][${entry.source}] ${entry.stage} +${entry.sincePreviousMs}ms (${entry.sinceStartMs}ms total)`;
}
