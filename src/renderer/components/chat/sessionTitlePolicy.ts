import {
  areSessionTitlesEqual,
  getMeaningfulTerminalTitle,
  isUnusableSessionTitle,
  normalizeSessionTitleText,
} from './sessionTitleText';

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

  if (isUnusableSessionTitle(candidate)) {
    return null;
  }

  if (input.userRenamed) {
    return null;
  }

  const terminalTitle = getMeaningfulTerminalTitle(input.terminalTitle);
  if (terminalTitle && !areSessionTitlesEqual(terminalTitle, input.defaultName)) {
    return null;
  }

  if (!areSessionTitlesEqual(input.currentName, input.defaultName)) {
    return null;
  }

  return candidate;
}
