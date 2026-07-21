import {
  getCanonicalSessionName,
  getExplicitSessionName,
  getStoredSessionName,
} from './sessionTitleText';

export interface SessionBarLabelInput {
  name: string;
  defaultName?: string;
  agentId?: string;
  userRenamed?: boolean;
}

export function getSessionDisplayName(session: SessionBarLabelInput): string {
  const fallbackName = getStoredSessionName(session.name, session.agentId, session.defaultName);
  if (session.userRenamed) {
    return getExplicitSessionName(session.name, session.agentId, session.defaultName);
  }

  if (session.agentId) {
    return getCanonicalSessionName(session);
  }

  return fallbackName;
}

export function getSessionHoverTitle(session: SessionBarLabelInput): string {
  return getSessionDisplayName(session);
}
