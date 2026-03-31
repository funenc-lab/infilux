import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { repositorySidebarSource } from './repositorySidebarSource';
import { treeSidebarSource } from './treeSidebarSource';
import { worktreePanelSource } from './worktreePanelSource';

const currentDir = dirname(fileURLToPath(import.meta.url));
const runningProjectsSource = readFileSync(
  resolve(currentDir, '../RunningProjectsPopover.tsx'),
  'utf8'
);
const temporaryWorkspacePanelSource = readFileSync(
  resolve(currentDir, '../TemporaryWorkspacePanel.tsx'),
  'utf8'
);
const worktreeTreeItemSource = readFileSync(
  resolve(currentDir, '../tree-sidebar/WorktreeTreeItem.tsx'),
  'utf8'
);
const worktreePanelItemSource = readFileSync(
  resolve(currentDir, '../worktree-panel/WorktreeItem.tsx'),
  'utf8'
);
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('sidebar design policy', () => {
  it('keeps sidebar headers action-led instead of repeating section labels', () => {
    expect(treeSidebarSource).not.toContain('<span className="control-sidebar-title">');
    expect(repositorySidebarSource).not.toContain('<span className="control-sidebar-title">');
    expect(worktreePanelSource).not.toContain('<span className="control-sidebar-title">');
    expect(temporaryWorkspacePanelSource).not.toContain('<span className="control-sidebar-title">');
    expect(repositorySidebarSource).not.toContain("{activeGroup?.name ?? t('All repositories')}");
    expect(treeSidebarSource).toContain(
      '<div className="control-sidebar-heading no-drag" aria-hidden="true" />'
    );
    expect(repositorySidebarSource).toContain(
      '<div className="control-sidebar-heading no-drag" aria-hidden="true" />'
    );
    expect(worktreePanelSource).toContain(
      '<div className="control-sidebar-heading no-drag" aria-hidden="true" />'
    );
    expect(temporaryWorkspacePanelSource).toContain(
      '<div className="control-sidebar-heading no-drag" aria-hidden="true" />'
    );
  });

  it('keeps worktree rows aligned with the tree-row language instead of panel cards', () => {
    expect(worktreePanelSource).toContain('control-tree-node relative flex w-full flex-col');
    expect(treeSidebarSource).toContain('const buttonContent = (');
    expect(treeSidebarSource).toContain(
      '<div className="control-tree-guide-item">{buttonContent}</div>'
    );
    expect(treeSidebarSource).toContain('data-surface="row"');
    expect(worktreePanelSource).toContain('data-surface="row"');
    expect(treeSidebarSource).toContain('control-tree-row');
    expect(repositorySidebarSource).toContain('control-tree-row');
    expect(worktreePanelSource).toContain('control-tree-row');
    expect(treeSidebarSource).toContain('control-tree-meta-inline');
    expect(repositorySidebarSource).toContain('control-tree-meta-inline');
    expect(worktreePanelSource).toContain('control-tree-meta-inline');
    expect(worktreePanelSource).not.toContain('pl-[1.625rem]');
    expect(worktreePanelSource).not.toContain(
      'control-panel-muted relative flex w-full flex-col items-start gap-2 rounded-xl p-3'
    );
  });

  it('keeps repository activity counts visible without selection-only gating', () => {
    expect(repositorySidebarSource).not.toContain('(isSelected || activeWorktreeCount > 0) &&');
    expect(treeSidebarSource).not.toContain(
      '(isSelected || isExpanded || activeWorktreeCount > 0) &&'
    );
    expect(repositorySidebarSource).toContain(
      `data-selection-tone={isSelected && activeWorktreeCount > 0 ? 'context' : 'default'}`
    );
    expect(treeSidebarSource).toContain(
      `data-selection-tone={isSelected && activeWorktreeCount > 0 ? 'context' : 'default'}`
    );
    expect(treeSidebarSource).toContain(
      `data-selection-tone={hasActiveTempWorkspace ? 'context' : 'default'}`
    );
    expect(repositorySidebarSource).toContain(
      `data-selection-tone={hasActiveTempWorkspace ? 'context' : 'default'}`
    );
  });

  it('keeps git diff polling available for loaded worktrees instead of activity-only rows', () => {
    expect(treeSidebarSource).toContain('const loadedPaths = allWorktrees.map((wt) => wt.path);');
    expect(treeSidebarSource).not.toContain('const activePaths = allWorktrees');
    expect(worktreePanelSource).toContain(
      'const loadedPaths = safeWorktrees.map((wt) => wt.path);'
    );
    expect(worktreePanelSource).not.toContain('const activePaths = worktrees');
  });

  it('keeps repository paths visible while removing duplicated project labels from worktree rows', () => {
    expect(treeSidebarSource).toContain('title={displayRepoPath}');
    expect(treeSidebarSource).toContain('{displayRepoPath}');
    expect(treeSidebarSource).toContain('<RepositoryTreeSummary');
    expect(repositorySidebarSource).toContain('<RepositoryTreeSummary');
    expect(treeSidebarSource).toContain('<span className="control-tree-metric-label">trees</span>');
    expect(treeSidebarSource).toContain('<span className="control-tree-metric-label">live</span>');
    expect(treeSidebarSource).not.toContain(
      '{getDisplayPathBasename(worktree.path) || displayWorktreePath}'
    );
    expect(worktreePanelSource).not.toContain(
      'const shortWorktreePath = getDisplayPathBasename(worktree.path) || displayWorktreePath;'
    );
    expect(treeSidebarSource).not.toContain('pl-11');
    expect(repositorySidebarSource).not.toContain('pl-[1.375rem]');
  });

  it('prioritizes git decision signals ahead of runtime counters inside worktree rails', () => {
    expect(treeSidebarSource.indexOf("key: 'diff'")).toBeGreaterThan(
      treeSidebarSource.indexOf("key: 'state'")
    );
    expect(treeSidebarSource.indexOf("key: 'publish'")).toBeGreaterThan(
      treeSidebarSource.indexOf("key: 'diff'")
    );
    expect(treeSidebarSource.indexOf("key: 'sync'")).toBeGreaterThan(
      treeSidebarSource.indexOf("key: 'publish'")
    );
    expect(treeSidebarSource.indexOf("key: 'agents'")).toBeGreaterThan(
      treeSidebarSource.indexOf("key: 'sync'")
    );
    expect(worktreePanelSource.indexOf("key: 'diff'")).toBeGreaterThan(
      worktreePanelSource.indexOf("key: 'state'")
    );
    expect(worktreePanelSource.indexOf("key: 'publish'")).toBeGreaterThan(
      worktreePanelSource.indexOf("key: 'diff'")
    );
    expect(worktreePanelSource.indexOf("key: 'sync'")).toBeGreaterThan(
      worktreePanelSource.indexOf("key: 'publish'")
    );
    expect(worktreePanelSource.indexOf("key: 'agents'")).toBeGreaterThan(
      worktreePanelSource.indexOf("key: 'sync'")
    );
  });

  it('keeps dense git rail copy compact instead of repeating diff and sync labels', () => {
    expect(treeSidebarSource).toContain('data-kind="diff"');
    expect(treeSidebarSource).toContain('data-kind="sync"');
    expect(treeSidebarSource).toContain('control-tree-metric-prefix');
    expect(treeSidebarSource).not.toContain(
      '<span className="control-tree-metric-label">diff</span>'
    );
    expect(treeSidebarSource).not.toContain(
      '<span className="control-tree-metric-label">sync</span>'
    );
    expect(worktreePanelSource).toContain('data-kind="diff"');
    expect(worktreePanelSource).toContain('data-kind="sync"');
    expect(worktreePanelSource).not.toContain(
      '<span className="control-tree-metric-label">diff</span>'
    );
    expect(worktreePanelSource).not.toContain(
      '<span className="control-tree-metric-label">sync</span>'
    );
    expect(globalsSource).toContain('.control-tree-metric-prefix {');
  });

  it('centers single-line worktree rails instead of keeping the old two-line top bias', () => {
    expect(treeSidebarSource).toContain('data-layout="inline"');
    expect(worktreePanelSource).toContain('data-layout="inline"');
    expect(globalsSource).toContain('.control-tree-node[data-layout="inline"] {');
    expect(globalsSource).toContain('--control-tree-glyph-offset-y: 0;');
    expect(globalsSource).toContain('--control-tree-tail-offset-y: 0;');
    expect(globalsSource).toContain('--control-tree-row-gap: 0.5rem;');
    expect(globalsSource).toContain('.control-tree-node[data-layout="inline"] .control-tree-row,');
    expect(globalsSource).toContain(
      '.control-tree-node[data-layout="inline"] .control-tree-primary-content {'
    );
    expect(globalsSource).toContain('.control-tree-node[data-layout="inline"] .control-tree-row {');
    expect(globalsSource).toContain('min-height: 2.5rem;');
    expect(globalsSource).toContain(
      '.control-tree-node[data-layout="inline"] .control-tree-tail {'
    );
  });

  it('keeps worktree runtime presence inline as counters instead of a named agent child row', () => {
    expect(treeSidebarSource).toContain("key: 'agents'");
    expect(treeSidebarSource).not.toContain('<WorktreeAgentSummary');
    expect(treeSidebarSource).not.toContain('<WorktreeAgentChildren');
    expect(treeSidebarSource).not.toContain('useLiveSubagents(');
    expect(treeSidebarSource).not.toContain('buildActiveSessionMapByWorktree(');
    expect(treeSidebarSource).not.toContain('session={activeSession}');
    expect(treeSidebarSource).not.toContain('subagents={liveSubagents}');
    expect(treeSidebarSource).not.toContain('className="pl-5"');
    expect(worktreeTreeItemSource).toContain('control-tree-metric-icon');
    expect(worktreeTreeItemSource).not.toContain(
      '<span className="control-tree-metric-label">{t(\'agents\')}</span>'
    );
    expect(worktreeTreeItemSource).not.toContain(
      '<span className="control-tree-metric-label">{t(\'terminals\')}</span>'
    );
    expect(worktreePanelItemSource).toContain('control-tree-metric-icon');
    expect(worktreePanelItemSource).not.toContain(
      '<span className="control-tree-metric-label">{t(\'agents\')}</span>'
    );
    expect(worktreePanelItemSource).not.toContain(
      '<span className="control-tree-metric-label">{t(\'terminals\')}</span>'
    );
    expect(globalsSource).toContain('.control-tree-metric-icon {');
  });

  it('adds completed-task dots to worktree rows and clears them when the row is selected', () => {
    expect(treeSidebarSource).toContain('control-task-completion-dot');
    expect(worktreePanelSource).toContain('control-task-completion-dot');
    expect(treeSidebarSource).toContain('clearTaskCompletedUnreadByWorktree(worktree.path);');
    expect(worktreePanelSource).toContain('clearTaskCompletedUnreadByWorktree(worktree.path);');
    expect(globalsSource).toContain('.control-task-completion-dot {');
    expect(globalsSource).toContain(
      '.control-tree-node[data-active="worktree"] .control-task-completion-dot {'
    );
    expect(globalsSource).toContain('opacity: 0;');
  });

  it('keeps search and filtered-empty copy aligned across sidebar variants', () => {
    expect(treeSidebarSource).toContain("aria-label={t('Search projects')}");
    expect(treeSidebarSource).toMatch(/placeholder=\{`\$\{t\('Search projects'\)\} \(:active\)`\}/);
    expect(repositorySidebarSource).toContain("aria-label={t('Search projects')}");
    expect(repositorySidebarSource).toMatch(
      /placeholder=\{`\$\{t\('Search projects'\)\} \(:active\)`\}/
    );
    expect(treeSidebarSource).toContain(
      'No projects match the current search. Try a broader term or clear the filter.'
    );
    expect(repositorySidebarSource).toContain(
      'No projects match the current search. Try a broader term or clear the filter.'
    );
    expect(repositorySidebarSource).not.toContain("aria-label={t('Search repositories')}");
  });

  it('keeps selection styling restrained and removes worktree flags', () => {
    expect(worktreePanelSource).not.toContain('control-tree-flag control-tree-flag-main');
    expect(treeSidebarSource).not.toContain('control-tree-flag control-tree-flag-main');
    expect(temporaryWorkspacePanelSource).not.toContain('control-tree-flag control-tree-flag-main');
    expect(globalsSource).toContain('opacity: 0;');
    expect(globalsSource).toContain('background: transparent;');
  });

  it('tones down the sidebar footer call-to-action surface', () => {
    expect(globalsSource).toContain(
      'background: color-mix(in oklch, var(--background) 97%, var(--muted) 3%);'
    );
    expect(globalsSource).toContain(
      'background: color-mix(in oklch, var(--primary) 9%, var(--background) 91%);'
    );
  });

  it('keeps the running projects trigger neutral and reserves live color for the badge', () => {
    expect(runningProjectsSource).not.toContain("totalRunning > 0 && 'text-foreground'");
    expect(runningProjectsSource).not.toContain('data-emphasis={totalRunning > 0 ?');
    expect(runningProjectsSource).toContain('<span className="control-toolbar-badge-anchor">');
    expect(runningProjectsSource).toContain("data-open={open ? 'true' : 'false'}");
    expect(globalsSource).toContain('.control-sidebar-toolbutton[data-open="true"]');
    expect(globalsSource).toContain('var(--control-surface-muted) 16%');
    expect(globalsSource).not.toContain(
      '.control-sidebar-toolbutton[data-open="true"] {\n    color: color-mix(\n      in oklch,\n      var(--control-live)'
    );
    expect(runningProjectsSource).toContain(
      '<span className="control-badge control-badge-live control-toolbar-badge control-toolbar-badge-green">'
    );
    expect(globalsSource).toContain('.control-toolbar-badge {');
    expect(globalsSource).toContain('.control-toolbar-badge-anchor {');
  });

  it('keeps inline empty states from indenting deeper than worktree rows', () => {
    expect(globalsSource).toContain('.control-tree-inline-empty {');
    expect(globalsSource).toContain('padding: 0.75rem 0.875rem 0.75rem 0.5rem;');
    expect(globalsSource).not.toContain('padding: 0.75rem 0.875rem;');
  });

  it('keeps running projects and temp sessions aligned with the flattened tree hierarchy', () => {
    expect(runningProjectsSource).toContain("data-active={isSelected ? 'worktree' : 'false'}");
    expect(runningProjectsSource).toContain('control-tree-title min-w-0 flex-1 truncate');
    expect(runningProjectsSource).toContain(
      'control-tree-subtitle overflow-hidden whitespace-nowrap text-ellipsis'
    );
    expect(runningProjectsSource).not.toContain(
      '<span className="text-muted-foreground">{item.project.repoName}</span>'
    );
    expect(temporaryWorkspacePanelSource).toContain('control-tree-meta control-tree-meta-inline');
    expect(temporaryWorkspacePanelSource).not.toContain('Disposable workspaces');
  });

  it('keeps hover states lighter than selected states across the shell', () => {
    expect(globalsSource).toContain('.control-topbar-tab[data-active="false"]:hover {');
    expect(globalsSource).toContain('var(--control-surface-muted) 22%');
    expect(globalsSource).toContain('.control-topbar-tab[data-active="true"] {');
    expect(globalsSource).toContain('box-shadow: inset 0 0 0 1px');
    expect(globalsSource).toContain('--control-tree-node-bg: transparent;');
    expect(globalsSource).toContain('--control-tree-node-border: transparent;');
    expect(globalsSource).toContain('--control-tree-title-weight: 590;');
    expect(globalsSource).toContain('.control-tree-node[data-active="false"]:hover {');
    expect(globalsSource).toContain('var(--accent) 0.9%');
    expect(globalsSource).toContain('--control-tree-title-weight: 580;');
    expect(globalsSource).toContain('.control-tree-node[data-active="repo"] {');
    expect(globalsSource).toContain('var(--accent) 2.4%');
    expect(globalsSource).toContain('--control-tree-title-weight: 582;');
    expect(globalsSource).toContain(
      '.control-tree-node[data-active="repo"][data-selection-tone="context"] {'
    );
    expect(globalsSource).toContain('var(--accent) 2.25%');
    expect(globalsSource).toContain('--control-tree-title-weight: 584;');
    expect(globalsSource).toContain('.control-tree-node[data-active="worktree"] {');
    expect(globalsSource).toContain('var(--primary) 4.2%');
    expect(globalsSource).toContain('--control-tree-title-weight: 608;');
    expect(globalsSource).toContain('.control-tree-node[data-active="worktree"]:hover {');
    expect(globalsSource).toContain('--control-tree-title-weight: 604;');
    expect(globalsSource).not.toContain('var(--accent) 2.8%');
    expect(globalsSource).not.toContain('var(--border) 40%');
    expect(globalsSource).not.toContain('var(--primary) 4.8%');
    expect(globalsSource).not.toContain('var(--primary) 26%');
    expect(globalsSource).toContain('font-weight: var(--control-tree-title-weight);');
    expect(globalsSource).toContain('color: var(--control-tree-title-color);');
  });

  it('gives selected repo and worktree rows a structural rail instead of relying only on tint', () => {
    expect(globalsSource).toContain('--control-tree-rail-color: transparent;');
    expect(globalsSource).toContain('--control-tree-rail-opacity: 0;');
    expect(globalsSource).toContain('--control-tree-rail-width: 1px;');
    expect(globalsSource).toContain('width: var(--control-tree-rail-width);');
    expect(globalsSource).toContain('background: var(--control-tree-rail-color);');
    expect(globalsSource).toContain('opacity: var(--control-tree-rail-opacity);');
    expect(globalsSource).toContain('--control-tree-rail-width: 1.5px;');
    expect(globalsSource).toContain('--control-tree-rail-width: 2px;');
  });

  it('uses shared menu typography across sidebar and running-project context menus', () => {
    expect(repositorySidebarSource).not.toContain(
      'control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm'
    );
    expect(repositorySidebarSource).not.toContain(
      'control-menu-item control-menu-item-danger flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm'
    );
    expect(worktreePanelSource).not.toContain(
      'control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm'
    );
    expect(worktreePanelSource).not.toContain(
      'control-menu-item control-menu-item-danger flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm'
    );
    expect(treeSidebarSource).not.toContain(
      'control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm'
    );
    expect(treeSidebarSource).not.toContain(
      'control-menu-item control-menu-item-danger flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm'
    );
    expect(runningProjectsSource).not.toContain(
      'control-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm'
    );
  });

  it('keeps title and icon emphasis on a continuous ramp from idle to active', () => {
    expect(globalsSource).toContain(
      '--control-tree-title-color: color-mix(in oklch, var(--foreground) 90%, var(--muted-foreground) 10%);'
    );
    expect(globalsSource).toContain(
      '--control-tree-title-color: color-mix(in oklch, var(--foreground) 89%, var(--muted-foreground) 11%);'
    );
    expect(globalsSource).toContain(
      '--control-tree-title-color: color-mix(in oklch, var(--foreground) 98%, var(--muted-foreground) 2%);'
    );
    expect(globalsSource).toContain('var(--foreground) 48%');
    expect(globalsSource).toContain('var(--foreground) 54%');
    expect(globalsSource).toContain('var(--foreground) 56%');
  });

  it('keeps secondary text emphasis on a continuous ramp from idle to active', () => {
    expect(globalsSource).toContain(
      '--control-tree-subtitle-color: color-mix(\n      in oklch,\n      var(--muted-foreground) 72%,\n      var(--background) 28%\n    );'
    );
    expect(globalsSource).toContain(
      '--control-tree-subtitle-color: color-mix(\n      in oklch,\n      var(--muted-foreground) 58%,\n      var(--foreground) 42%\n    );'
    );
    expect(globalsSource).toContain(
      '--control-tree-subtitle-color: color-mix(\n      in oklch,\n      var(--muted-foreground) 42%,\n      var(--foreground) 58%\n    );'
    );
    expect(globalsSource).toContain(
      '--control-tree-subtitle-color: color-mix(\n      in oklch,\n      var(--muted-foreground) 34%,\n      var(--foreground) 66%\n    );'
    );
    expect(globalsSource).toContain(
      '--control-tree-metric-label-color: color-mix(in oklch, var(--muted-foreground) 50%, transparent);'
    );
    expect(globalsSource).toContain(
      '--control-tree-metric-label-color: color-mix(in oklch, var(--muted-foreground) 40%, transparent);'
    );
    expect(globalsSource).toContain(
      '--control-tree-metric-label-color: color-mix(in oklch, var(--muted-foreground) 32%, transparent);'
    );
    expect(globalsSource).toContain(
      '--control-tree-separator-color: color-mix(in oklch, var(--muted-foreground) 34%, transparent);'
    );
  });

  it('creates clearer rhythm between groups and their rows', () => {
    expect(treeSidebarSource).toContain('<div className="control-tree-section-list">');
    expect(repositorySidebarSource).toContain('<div className="control-tree-section-list">');
    expect(treeSidebarSource).toContain('<div className="control-tree-section-body">');
    expect(repositorySidebarSource).toContain('<div className="control-tree-section-body">');
    expect(treeSidebarSource).toContain('<div className="control-tree-flat-list">');
    expect(repositorySidebarSource).toContain('<div className="control-tree-flat-list">');
    expect(worktreePanelSource).toContain('<div className="control-tree-flat-list">');
  });

  it('reduces section header noise and removes decorative color dots', () => {
    expect(treeSidebarSource).not.toContain('style={{ backgroundColor: section.color }}');
    expect(repositorySidebarSource).not.toContain('style={{ backgroundColor: section.color }}');
    expect(treeSidebarSource).toContain('className="control-section-marker"');
    expect(repositorySidebarSource).toContain('className="control-section-marker"');
    expect(globalsSource).toContain('.control-section-header:hover {');
    expect(globalsSource).toContain('var(--accent) 0.9%');
    expect(globalsSource).toContain(
      'box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--border) 14%, transparent);'
    );
    expect(globalsSource).toContain('.control-section-header:focus-visible {');
    expect(globalsSource).toContain('var(--accent) 1.3%');
    expect(globalsSource).toContain(
      '.control-section-header:hover .control-section-count,\n  .control-section-header:focus-visible .control-section-count {'
    );
    expect(globalsSource).toContain(
      '.control-section-header:hover .control-section-marker,\n  .control-section-header:focus-visible .control-section-marker {'
    );
    expect(globalsSource).toContain('.control-section-count {');
  });

  it('keeps row actions subordinate to the row and removes inline hover styling', () => {
    expect(globalsSource).toContain('.control-tree-action:hover,');
    expect(globalsSource).toContain('opacity: 0.18;');
    expect(globalsSource).toContain('var(--border) 18%');
    expect(globalsSource).toContain(
      'background: color-mix(in oklch, var(--accent) 2.4%, transparent);'
    );
    expect(globalsSource).toContain('var(--border) 26%');
    expect(globalsSource).toContain('.control-tree-tail[data-role="action"] {');
    expect(globalsSource).toContain('opacity: 0.36;');
    expect(globalsSource).toContain('--control-tree-tail-opacity: 0.18;');
    expect(globalsSource).toContain('--control-tree-tail-opacity: 0.24;');
    expect(repositorySidebarSource).toContain(
      'control-tree-action flex h-6 w-6 shrink-0 items-center justify-center rounded-md'
    );
    expect(repositorySidebarSource).toContain('className="control-tree-tail" data-role="action"');
    expect(treeSidebarSource).toContain(
      'control-tree-action flex h-6 w-6 shrink-0 items-center justify-center rounded-md'
    );
    expect(treeSidebarSource).not.toContain(
      '<Plus className="h-3.5 w-3.5 text-muted-foreground" />'
    );
    expect(treeSidebarSource).not.toContain(
      'control-tree-action mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md'
    );
    expect(treeSidebarSource).toContain('data-role="action"');
    expect(treeSidebarSource).toContain('data-kind="diff"');
    expect(treeSidebarSource).not.toContain('control-tree-separator control-tree-separator-diff');
    expect(treeSidebarSource).toContain('control-tree-meta control-tree-meta-inline');
    expect(globalsSource).toContain(
      '.control-tree-node[data-active="false"] .control-tree-metric[data-kind="diff"] {'
    );
    expect(globalsSource).toContain('opacity: 0.54;');
    expect(globalsSource).toContain('.control-tree-sync {');
    expect(globalsSource).toContain(
      '.control-tree-node[data-active="worktree"] .control-tree-tail[data-role="action"] .control-tree-sync {'
    );
    expect(globalsSource).toContain('min-height: 2.25rem;');
    expect(globalsSource).toContain('min-width: 2.25rem;');
    expect(globalsSource).toContain('min-height: 2rem;');
    expect(globalsSource).toContain('padding-inline: 0.5rem;');
    expect(globalsSource).toContain(
      'background: color-mix(in oklch, var(--background) 97%, var(--muted) 3%);'
    );
  });

  it('keeps tail spacing and alignment driven by shared row-tail tokens', () => {
    expect(globalsSource).toContain('--control-tree-tail-gap: 0.375rem;');
    expect(globalsSource).toContain('--control-tree-tail-offset-y: 0.125rem;');
    expect(globalsSource).toContain('--control-tree-tail-padding-start: 0.5rem;');
    expect(globalsSource).toContain('gap: var(--control-tree-tail-gap);');
    expect(globalsSource).toContain(
      'padding-inline-start: var(--control-tree-tail-padding-start);'
    );
    expect(globalsSource).toContain('transform: translateY(var(--control-tree-tail-offset-y));');
    expect(treeSidebarSource).not.toContain('self-start pl-1');
    expect(worktreePanelSource).not.toContain('self-start pl-1');
  });

  it('keeps row grid rhythm driven by shared leading and text-offset tokens', () => {
    expect(globalsSource).toContain('--control-tree-row-gap: 0.375rem;');
    expect(globalsSource).toContain('--control-tree-glyph-slot-size: 1rem;');
    expect(globalsSource).toContain('--control-tree-text-offset: calc(');
    expect(globalsSource).toContain('.control-tree-row {');
    expect(globalsSource).toContain('.control-tree-primary-content {');
    expect(globalsSource).toContain('.control-tree-text-stack {');
    expect(globalsSource).toContain('.control-tree-meta-offset {');
    expect(globalsSource).toContain('.control-tree-meta-inline {');
    expect(treeSidebarSource).toContain('control-tree-primary-content');
    expect(repositorySidebarSource).toContain('control-tree-primary-content');
    expect(worktreePanelSource).toContain('control-tree-primary-content');
  });

  it('keeps section stacks and guide indentation driven by shared structural classes', () => {
    expect(globalsSource).toContain('.control-tree-section-list {');
    expect(globalsSource).toContain('.control-tree-section-body {');
    expect(globalsSource).toContain('.control-tree-collapsible {');
    expect(globalsSource).toContain('.control-tree-flat-list {');
    expect(globalsSource).toContain('.control-tree-guide {');
    expect(globalsSource).toContain('margin-left: 0.375rem;');
    expect(globalsSource).toContain('padding-left: 0.875rem;');
    expect(globalsSource).toContain('.control-tree-guide::before {');
    expect(globalsSource).toContain('content: none;');
    expect(globalsSource).toContain('.control-tree-guide-item {');
    expect(globalsSource).toContain('.control-tree-guide-item::before {');
    expect(treeSidebarSource).toContain('className="control-tree-guide-item"');
    expect(treeSidebarSource).not.toContain('space-y-2');
    expect(treeSidebarSource).not.toContain('space-y-1 pt-1');
    expect(repositorySidebarSource).not.toContain('space-y-2');
    expect(repositorySidebarSource).not.toContain('space-y-1 pt-1');
    expect(treeSidebarSource).not.toContain(
      'ml-3.5 mr-1 mt-0.5 flex flex-col gap-y-0.5 overflow-hidden pl-1.5'
    );
  });

  it('keeps tree loading and empty states inside the same flat tree language', () => {
    expect(globalsSource).toContain('.control-tree-inline-empty {');
    expect(globalsSource).toContain('.control-tree-inline-title {');
    expect(globalsSource).toContain('.control-tree-inline-copy {');
    expect(globalsSource).toContain('.control-tree-skeleton {');
    expect(treeSidebarSource).toContain('className="control-tree-inline-empty"');
    expect(treeSidebarSource).toContain('className="control-tree-skeleton"');
    expect(treeSidebarSource).not.toContain(
      'animate-pulse rounded-lg border border-theme/12 bg-theme/8'
    );
  });

  it('keeps vertical density driven by shared content-baseline tokens', () => {
    expect(globalsSource).toContain('--control-tree-glyph-offset-y: 0.125rem;');
    expect(globalsSource).toContain('--control-tree-subtitle-offset-y: 0.0625rem;');
    expect(globalsSource).toContain('--control-tree-meta-offset-y: 0.25rem;');
    expect(globalsSource).toContain('margin-top: var(--control-tree-glyph-offset-y);');
    expect(globalsSource).toContain('margin-top: var(--control-tree-subtitle-offset-y);');
    expect(globalsSource).toContain('margin-top: var(--control-tree-meta-offset-y);');
    expect(treeSidebarSource).not.toContain('control-tree-glyph mt-0.5');
    expect(treeSidebarSource).not.toContain('control-tree-subtitle mt-px');
    expect(treeSidebarSource).not.toContain('control-tree-meta control-tree-meta-row mt-0.5');
    expect(worktreePanelSource).not.toContain('control-tree-glyph mt-0.5');
    expect(worktreePanelSource).not.toContain(
      'control-tree-meta control-tree-meta-row control-tree-meta-offset mt-0.5'
    );
    expect(repositorySidebarSource).not.toContain('control-tree-glyph mt-0.5');
    expect(repositorySidebarSource).not.toContain('control-tree-subtitle mt-px');
    expect(repositorySidebarSource).not.toContain('control-tree-meta control-tree-meta-row mt-0.5');
  });

  it('keeps disclosure controls between the row and overflow action hierarchy', () => {
    expect(globalsSource).toContain('.control-tree-disclosure {');
    expect(globalsSource).toContain('--control-tree-disclosure-opacity: 0.64;');
    expect(globalsSource).toContain('--control-tree-disclosure-color: color-mix(');
    expect(globalsSource).toContain(
      '.control-tree-node[data-active="repo"][data-selection-tone="context"] {'
    );
    expect(globalsSource).toContain('--control-tree-disclosure-opacity: 0.68;');
    expect(globalsSource).toContain('.control-tree-node[data-active="repo"]:hover {');
    expect(globalsSource).toContain('--control-tree-disclosure-opacity: 0.76;');
    expect(globalsSource).toContain('.control-tree-disclosure:hover,');
    expect(globalsSource).toContain('var(--border) 24%');
    expect(globalsSource).toContain('var(--accent) 2.2%');
    expect(treeSidebarSource).toContain('className="control-tree-disclosure h-6 w-6 shrink-0"');
    expect(treeSidebarSource).not.toContain(
      'className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-theme/10 hover:text-foreground"'
    );
  });

  it('keeps worktree rows on a single visual surface to avoid nested selection borders', () => {
    expect(globalsSource).toContain('.control-tree-primary[data-surface="row"] {');
    expect(globalsSource).toContain('border-radius: 0;');
    expect(globalsSource).toContain('box-shadow: none;');
    expect(globalsSource).toContain(
      '.control-tree-node[data-active="worktree"] .control-tree-primary[data-surface="row"] {'
    );
    expect(treeSidebarSource).not.toContain('rounded-[inherit]');
    expect(worktreePanelSource).not.toContain('rounded-[inherit]');
  });

  it('uses shared menu item styling instead of scattered sidebar hover classes', () => {
    expect(globalsSource).toContain('.control-menu-item {');
    expect(globalsSource).toContain('.control-menu-item-danger {');
    expect(globalsSource).toContain('.control-menu-item:hover,');
    expect(treeSidebarSource).toContain('control-menu-item flex w-full items-center gap-2');
    expect(worktreePanelSource).toContain('control-menu-item flex w-full items-center gap-2');
    expect(repositorySidebarSource).toContain('control-menu-item flex w-full items-center gap-2');
    expect(runningProjectsSource).toContain('control-menu-item flex w-full items-center gap-2');
    expect(treeSidebarSource).not.toContain('hover:bg-theme/10');
    expect(worktreePanelSource).not.toContain('hover:bg-theme/10');
    expect(repositorySidebarSource).not.toContain('hover:bg-theme/10');
    expect(runningProjectsSource).not.toContain('hover:bg-theme/10');
    expect(treeSidebarSource).not.toContain('hover:bg-destructive/10');
  });
});
