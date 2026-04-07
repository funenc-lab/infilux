import { getMeaningfulTerminalTitle, normalizeSessionTitleText } from './sessionTitleText';

export interface SessionTitleFromFirstInput {
  line: string;
  currentName: string;
  defaultName: string;
  terminalTitle?: string;
  userRenamed?: boolean;
}

export function resolveSessionTitleFromFirstInput(
  input: SessionTitleFromFirstInput
): string | null {
  const candidate = normalizeSessionTitleText(input.line);
  if (!candidate) return null;

  if (candidate.startsWith('/')) {
    return null;
  }

  if (input.userRenamed) {
    return null;
  }

  if (getMeaningfulTerminalTitle(input.terminalTitle)) {
    return null;
  }

  if (input.currentName !== input.defaultName) {
    return null;
  }

  return candidate;
}
