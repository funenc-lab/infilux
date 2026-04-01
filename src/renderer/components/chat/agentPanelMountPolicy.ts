import { pathsEqual } from '@/App/storage';

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
    .filter((session) => session.repoPath === repoPath && pathsEqual(session.cwd, cwd))
    .map((session) => session.id);
}
