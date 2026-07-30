import type { AgentSessionTitleSource } from '@shared/types';
import {
  areSessionTitlesEqual,
  getDefaultSessionName,
  getExplicitSessionName,
  getStoredSessionName,
  isUnusableSessionTitle,
  normalizeSessionTitleText,
} from './sessionTitleText';

export interface SessionTitleFromTrustedUserMessage {
  text: string;
  currentName: string;
  defaultName: string;
  titleSource?: AgentSessionTitleSource;
  userRenamed?: boolean;
}

export interface SessionTitleStateInput {
  agentId?: string;
  currentName: string;
  defaultName?: string;
  titleSource?: AgentSessionTitleSource;
  userRenamed?: boolean;
}

export interface ResolvedSessionTitleState {
  name: string;
  titleSource: AgentSessionTitleSource;
}

export function resolveSessionTitleSource(input: {
  titleSource?: AgentSessionTitleSource;
  userRenamed?: boolean;
}): AgentSessionTitleSource {
  if (input.userRenamed) {
    return 'manual';
  }

  if (input.titleSource && input.titleSource !== 'manual') {
    return input.titleSource;
  }

  return 'default';
}

export function resolveSessionTitleState(input: SessionTitleStateInput): ResolvedSessionTitleState {
  const titleSource = resolveSessionTitleSource(input);
  const defaultName = getDefaultSessionName(input.agentId, input.defaultName);

  if (titleSource === 'manual') {
    return {
      name: getExplicitSessionName(input.currentName, input.agentId, defaultName),
      titleSource,
    };
  }

  if (titleSource === 'default') {
    return { name: defaultName, titleSource };
  }

  return {
    name: getStoredSessionName(input.currentName, input.agentId, defaultName),
    titleSource,
  };
}

export function resolveLegacySessionTitleState(
  input: SessionTitleStateInput
): ResolvedSessionTitleState {
  const resolvedTitleState = resolveSessionTitleState(input);
  if (input.userRenamed || input.titleSource !== undefined) {
    return resolvedTitleState;
  }

  const defaultName = getDefaultSessionName(input.agentId, input.defaultName);
  const legacyName = getStoredSessionName(input.currentName, input.agentId, defaultName);
  if (areSessionTitlesEqual(legacyName, defaultName)) {
    return resolvedTitleState;
  }

  return {
    name: legacyName,
    titleSource: 'legacy-unknown',
  };
}

export function resolveSessionTitleFromTrustedUserMessage(
  input: SessionTitleFromTrustedUserMessage
): string | null {
  const candidate = normalizeSessionTitleText(input.text);
  if (!candidate) return null;

  if (candidate.startsWith('/')) {
    return null;
  }

  if (isUnusableSessionTitle(candidate)) {
    return null;
  }

  if (resolveSessionTitleSource(input) !== 'default') {
    return null;
  }

  return candidate;
}
