import type { GitStatus } from '@shared/types';

interface SessionHandoffPromptInput {
  sessionName: string;
  worktreePath: string;
  projectPath?: string;
  contextUsagePercent?: number;
  gitStatus?: GitStatus | null;
  diffStats?: {
    insertions: number;
    deletions: number;
  } | null;
  openFiles?: string[];
}

const MAX_OPEN_FILES_IN_HANDOFF = 4;

function formatGitPathList(paths: string[]): string {
  return paths.join(', ');
}

export function summarizeGitStatusForHandoff(status: GitStatus | null | undefined): string[] {
  if (!status || status.isClean) {
    return [];
  }

  const lines: string[] = ['Current uncommitted changes:'];

  if (status.staged.length > 0) {
    lines.push(`- Staged: ${formatGitPathList(status.staged)}`);
  }
  if (status.modified.length > 0) {
    lines.push(`- Modified: ${formatGitPathList(status.modified)}`);
  }
  if (status.deleted.length > 0) {
    lines.push(`- Deleted: ${formatGitPathList(status.deleted)}`);
  }
  if (status.untracked.length > 0) {
    lines.push(`- Untracked: ${formatGitPathList(status.untracked)}`);
  }
  if (status.conflicted.length > 0) {
    lines.push(`- Conflicted: ${formatGitPathList(status.conflicted)}`);
  }
  if (status.truncated) {
    lines.push(
      `- Change list truncated to the first ${status.truncatedLimit ?? 'available'} paths.`
    );
  }

  return lines;
}

export function buildSessionHandoffPrompt({
  sessionName,
  worktreePath,
  projectPath,
  contextUsagePercent,
  gitStatus,
  diffStats,
  openFiles,
}: SessionHandoffPromptInput): string {
  const lines = [
    'Previous session handoff:',
    `- Previous session: ${sessionName}`,
    `- Worktree: ${worktreePath}`,
  ];

  if (projectPath && projectPath !== worktreePath) {
    lines.push(`- Project: ${projectPath}`);
  }

  if (typeof contextUsagePercent === 'number' && Number.isFinite(contextUsagePercent)) {
    lines.push(`- Previous context usage: ${contextUsagePercent}%`);
  }

  if (diffStats && (diffStats.insertions > 0 || diffStats.deletions > 0)) {
    lines.push(`- Working tree diff stats: +${diffStats.insertions} / -${diffStats.deletions}`);
  }

  if (openFiles && openFiles.length > 0) {
    const visibleFiles = openFiles.slice(0, MAX_OPEN_FILES_IN_HANDOFF);
    lines.push(`- Open files: ${visibleFiles.join(', ')}`);
    if (openFiles.length > visibleFiles.length) {
      lines.push(`- Additional open files omitted: ${openFiles.length - visibleFiles.length}`);
    }
  }

  const gitSummaryLines = summarizeGitStatusForHandoff(gitStatus);
  if (gitSummaryLines.length > 0) {
    lines.push('', ...gitSummaryLines);
  }

  lines.push(
    '',
    'Start by briefly re-establishing context from the current repository state and the most relevant recent files.',
    'Then continue the task from where the previous session left off.',
    'Do not resume the previous session by ID unless explicitly asked.'
  );

  return lines.join('\n');
}
