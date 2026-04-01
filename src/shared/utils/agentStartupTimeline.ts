import {
  createStartupTimelineRecorder,
  type StartupTimelineEntry,
  type StartupTimelineRecorder,
  type StartupTimelineSource,
} from './startupTimeline';

export interface AgentStartupTimelineLogger {
  getEntries: () => StartupTimelineEntry[];
  markStage: (stage: string) => StartupTimelineEntry;
}

export function formatAgentStartupTimelineEntry({
  label,
  entry,
}: {
  label: string;
  entry: StartupTimelineEntry;
}): string {
  return `[agent-startup][${entry.source}][${label}] ${entry.stage} +${entry.sincePreviousMs}ms (${entry.sinceStartMs}ms total)`;
}

export function createAgentStartupTimelineLogger({
  source,
  getLabel,
  now = () => Date.now(),
  log = (message: string) => console.info(message),
  recorder = createStartupTimelineRecorder(source, now),
}: {
  source: StartupTimelineSource;
  getLabel: () => string;
  now?: () => number;
  log?: (message: string) => void;
  recorder?: StartupTimelineRecorder;
}): AgentStartupTimelineLogger {
  return {
    markStage(stage: string) {
      const entry = recorder.markStage(stage);
      log(formatAgentStartupTimelineEntry({ label: getLabel(), entry }));
      return entry;
    },
    getEntries() {
      return recorder.getEntries();
    },
  };
}
