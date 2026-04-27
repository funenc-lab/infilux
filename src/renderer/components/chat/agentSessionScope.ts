import { pathsEqual } from '@/App/storage';

interface AgentSessionRepoCandidate {
  repoPath: string;
}

interface AgentSessionScopeCandidate extends AgentSessionRepoCandidate {
  cwd: string;
}

export function matchesAgentSessionRepoPath(
  session: AgentSessionRepoCandidate,
  repoPath: string
): boolean {
  return pathsEqual(session.repoPath, repoPath);
}

export function matchesAgentSessionScope(
  session: AgentSessionScopeCandidate,
  repoPath: string,
  cwd: string
): boolean {
  return matchesAgentSessionRepoPath(session, repoPath) && pathsEqual(session.cwd, cwd);
}
