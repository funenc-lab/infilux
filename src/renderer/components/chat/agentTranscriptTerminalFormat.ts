import type { AgentSubagentTranscriptEntry } from '@shared/types';

const ANSI_RESET = '\x1b[0m';
const ANSI_DIM = '\x1b[90m';
const ANSI_TASK = '\x1b[96m';
const ANSI_UPDATE = '\x1b[36m';
const ANSI_FINAL = '\x1b[92m';
const ANSI_TOOL = '\x1b[93m';
const ANSI_REPLY = '\x1b[37m';

interface TranscriptEntryPresentation {
  color: string;
  label: string;
  marker: string;
}

export interface AgentTranscriptTerminalFormatOptions {
  locale?: string;
  timeZone?: string;
}

function getTranscriptEntryPresentation(
  entry: AgentSubagentTranscriptEntry
): TranscriptEntryPresentation {
  if (entry.kind === 'tool_call') {
    return {
      color: ANSI_TOOL,
      label: 'Tool call',
      marker: '$',
    };
  }

  if (entry.role === 'user') {
    return {
      color: ANSI_TASK,
      label: 'Task',
      marker: '>',
    };
  }

  if (entry.phase === 'final_answer') {
    return {
      color: ANSI_FINAL,
      label: 'Final answer',
      marker: '<',
    };
  }

  if (entry.phase === 'commentary') {
    return {
      color: ANSI_UPDATE,
      label: 'Update',
      marker: '~',
    };
  }

  return {
    color: ANSI_REPLY,
    label: 'Reply',
    marker: '<',
  };
}

function formatTimestamp(
  timestamp: number,
  options: AgentTranscriptTerminalFormatOptions
): string | null {
  if (!timestamp) {
    return null;
  }

  return new Intl.DateTimeFormat(options.locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: options.timeZone,
  }).format(timestamp);
}

function normalizeEntryText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  return lines.length > 0 ? lines : [''];
}

function formatEntryHeader(
  entry: AgentSubagentTranscriptEntry,
  options: AgentTranscriptTerminalFormatOptions
): string {
  const presentation = getTranscriptEntryPresentation(entry);
  const segments: string[] = [];
  const timestamp = formatTimestamp(entry.timestamp, options);

  if (timestamp) {
    segments.push(`${ANSI_DIM}[${timestamp}]${ANSI_RESET}`);
  }

  segments.push(
    `${presentation.color}${presentation.marker}${ANSI_RESET}`,
    `${presentation.color}${presentation.label}${ANSI_RESET}`
  );

  if (entry.toolName?.trim()) {
    segments.push(`${ANSI_DIM}${entry.toolName.trim()}${ANSI_RESET}`);
  }

  return segments.join(' ');
}

function formatEntryBody(text: string): string {
  return normalizeEntryText(text)
    .map((line) => `  ${line}`)
    .join('\r\n');
}

export function formatAgentTranscriptForTerminal(
  entries: AgentSubagentTranscriptEntry[],
  options: AgentTranscriptTerminalFormatOptions = {}
): string {
  if (entries.length === 0) {
    return '';
  }

  return entries
    .map((entry) => `${formatEntryHeader(entry, options)}\r\n${formatEntryBody(entry.text)}`)
    .join('\r\n\r\n');
}
