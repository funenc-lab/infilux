import { getMeaningfulTerminalTitle, getStoredSessionName } from './sessionTitleText';

export interface SessionBarLabelInput {
  terminalTitle?: string;
  name: string;
  agentId?: string;
  userRenamed?: boolean;
}

export function getSessionDisplayName(session: SessionBarLabelInput): string {
  const fallbackName = getStoredSessionName(session.name, session.agentId);
  if (session.userRenamed) return fallbackName;

  return getMeaningfulTerminalTitle(session.terminalTitle) ?? fallbackName;
}

export function getSessionHoverTitle(session: SessionBarLabelInput): string {
  return (
    getMeaningfulTerminalTitle(session.terminalTitle) ??
    getStoredSessionName(session.name, session.agentId)
  );
}
