import { matchesAgentSessionScope } from './agentSessionScope';

interface SessionMountCandidate {
  id: string;
  repoPath: string;
  cwd: string;
}

export function collectMountedAgentSessionIds(
  sessions: SessionMountCandidate[],
  repoPath: string,
  cwd: string
): string[] {
  return sessions
    .filter((session) => matchesAgentSessionScope(session, repoPath, cwd))
    .map((session) => session.id);
}
