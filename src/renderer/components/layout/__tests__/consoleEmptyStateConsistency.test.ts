import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const mainContentSource = readFileSync(resolve(currentDir, '../MainContent.tsx'), 'utf8');
const controlStateCardSource = readFileSync(resolve(currentDir, '../ControlStateCard.tsx'), 'utf8');
const treeSidebarSource = readFileSync(resolve(currentDir, '../TreeSidebar.tsx'), 'utf8');
const worktreePanelSource = readFileSync(resolve(currentDir, '../WorktreePanel.tsx'), 'utf8');
const temporaryWorkspacePanelSource = readFileSync(
  resolve(currentDir, '../TemporaryWorkspacePanel.tsx'),
  'utf8'
);
const terminalPanelSource = readFileSync(
  resolve(currentDir, '../../terminal/TerminalPanel.tsx'),
  'utf8'
);
const sourceControlPanelSource = readFileSync(
  resolve(currentDir, '../../source-control/SourceControlPanel.tsx'),
  'utf8'
);
const filePanelSource = readFileSync(resolve(currentDir, '../../files/FilePanel.tsx'), 'utf8');
const currentFilePanelSource = readFileSync(
  resolve(currentDir, '../../files/CurrentFilePanel.tsx'),
  'utf8'
);
const fileTreeSource = readFileSync(resolve(currentDir, '../../files/FileTree.tsx'), 'utf8');

describe('Console empty state consistency', () => {
  it('uses the shared control state card for flat main-panel idle states', () => {
    expect(controlStateCardSource).not.toContain('ConsoleEmptyState');
    expect(controlStateCardSource).toContain('metaLabel?: string');
    expect(controlStateCardSource).toContain('metaValue?: string');
    expect(mainContentSource).toContain('ControlStateCard');
    expect(terminalPanelSource).toContain('ControlStateCard');
    expect(sourceControlPanelSource).toContain('ControlStateCard');
    expect(filePanelSource).toContain('ControlStateCard');
    expect(currentFilePanelSource).toContain('ControlStateCard');
    expect(mainContentSource).toContain('metaLabel={t(');
    expect(terminalPanelSource).toContain('metaLabel={t(');
    expect(sourceControlPanelSource).toContain('metaLabel={t(');
    expect(filePanelSource).toContain('metaLabel={t(');
    expect(currentFilePanelSource).toContain('metaLabel={t(');
    expect(mainContentSource).toContain('Agent Console');
    expect(mainContentSource).not.toContain('cardClassName="max-w-[min(56rem,100%)]"');
    expect(mainContentSource).not.toContain('detailsLayout="compact"');
    expect(terminalPanelSource).not.toContain('detailsLayout="compact"');
    expect(sourceControlPanelSource).not.toContain('detailsLayout="compact"');
  });

  it('uses the shared sidebar empty state in the projects sidebar empty states', () => {
    expect(treeSidebarSource).toContain('SidebarEmptyState');
    expect(treeSidebarSource).not.toContain('EmptyHeader');
    expect(treeSidebarSource).not.toContain('EmptyTitle');
  });

  it('uses sidebar empty states for sidebar and tree containers', () => {
    expect(worktreePanelSource).toContain('SidebarEmptyState');
    expect(temporaryWorkspacePanelSource).toContain('SidebarEmptyState');
    expect(fileTreeSource).toContain('SidebarEmptyState');
    expect(worktreePanelSource).not.toContain('ConsoleEmptyState');
    expect(fileTreeSource).toContain('control-action-button-primary');
    expect(fileTreeSource).toContain('control-action-button-secondary');
  });
});
