export interface SessionTitleFromFirstInput {
  line: string;
  currentName: string;
  defaultName: string;
  terminalTitle?: string;
  userRenamed?: boolean;
}

function normalizeSessionTitleCandidate(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

export function resolveSessionTitleFromFirstInput(
  input: SessionTitleFromFirstInput
): string | null {
  const candidate = normalizeSessionTitleCandidate(input.line);
  if (!candidate) return null;

  if (candidate.startsWith('/')) {
    return null;
  }

  if (input.userRenamed) {
    return null;
  }

  if (input.terminalTitle?.trim()) {
    return null;
  }

  if (input.currentName !== input.defaultName) {
    return null;
  }

  return candidate;
}
