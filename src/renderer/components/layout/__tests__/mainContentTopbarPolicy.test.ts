import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mainContentSource } from './mainContentSource';

const currentDir = dirname(fileURLToPath(import.meta.url));
const openInMenuSource = readFileSync(resolve(currentDir, '../../app/OpenInMenu.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('main content topbar policy', () => {
  it('keeps repository and worktree context out of the header', () => {
    expect(mainContentSource).not.toContain(
      '<span className="control-topbar-context-label">{t(\'Repository\')}</span>'
    );
    expect(mainContentSource).not.toContain(
      '<span className="control-topbar-context-label">{t(\'Worktree\')}</span>'
    );
    expect(mainContentSource).not.toContain('title={repoLabel ?? undefined}');
    expect(mainContentSource).not.toContain('title={worktreeLabel ?? undefined}');
    expect(mainContentSource).not.toContain('control-topbar-meta');
  });

  it('removes agent and live-status summary chips from the header bottom row', () => {
    expect(mainContentSource).not.toContain("control-topbar-context-label'>{t('Agent')}");
    expect(mainContentSource).not.toContain('control-topbar-status');
    expect(mainContentSource).not.toContain('control-topbar-metric');
    expect(mainContentSource).not.toContain('getMainContentLiveStatus');
  });

  it('uses shared topbar typography tokens instead of hardcoded 12px action text', () => {
    expect(globalsSource).toContain('--ui-text-topbar-action-size');
    expect(globalsSource).toContain('font-size: var(--ui-text-topbar-action-size);');
    expect(mainContentSource).not.toContain('text-[12px]');
    expect(openInMenuSource).not.toContain('text-[12px]');
  });

  it('keeps runtime and token usage entries available from the shared main topbar', () => {
    expect(mainContentSource).toContain('AppResourceStatusPopover');
    expect(mainContentSource).toContain('TokenUsagePopover');
  });

  it('allows the shared topbar action cluster to wrap without clipping header buttons', () => {
    expect(globalsSource).toContain('.control-topbar-actions-cluster {');
    expect(globalsSource).toContain(
      'min-width: calc(var(--control-button-header-size) + 0.25rem);'
    );
    expect(globalsSource).toContain('max-width: 100%;');
    expect(globalsSource).toContain('flex: 0 1 auto;');
    expect(globalsSource).toContain('flex-wrap: wrap;');
    expect(globalsSource).toContain('justify-content: flex-end;');
  });

  it('keeps collapsed sidebar controls out of the topbar', () => {
    expect(mainContentSource).not.toContain('RunningProjectsPopover');
    expect(mainContentSource).not.toContain("title={t('Panels')}");
    expect(mainContentSource).not.toContain("aria-label={t('Panels')}");
    expect(mainContentSource).not.toContain("t('Expand Repository')");
    expect(mainContentSource).not.toContain("t('Expand Worktree')");
    expect(mainContentSource).not.toContain("t('Expand File Sidebar')");
  });

  it('supports a right-edge floating toolbar mode without occupying top layout space', () => {
    expect(mainContentSource).toContain('floatingToolbarEnabled');
    expect(mainContentSource).toContain('resolveFloatingToolbarRevealFrame');
    expect(mainContentSource).toContain('getFloatingToolbarRevealStyle(toolbarRevealFrame)');
    expect(mainContentSource).toContain('control-floating-toolbar-rail');
    expect(mainContentSource).toContain('data-floating-toolbar-reveal="active"');
    expect(mainContentSource).toContain("aria-label={t('Toolbar')}");
    expect(mainContentSource).toContain('title={tab.label}');
    expect(mainContentSource).toContain('control-floating-toolbar-tab');
    expect(mainContentSource).toContain('control-floating-toolbar-actions-cluster');
  });

  it('defines right-edge floating toolbar trigger, surface, and reveal motion styles', () => {
    expect(globalsSource).toContain('.control-floating-toolbar-rail {');
    expect(globalsSource).toContain('right: 0;');
    expect(globalsSource).toContain('width: var(--control-floating-toolbar-trigger-width);');
    expect(globalsSource).toContain('.control-floating-toolbar-panel {');
    expect(globalsSource).toContain('width: var(--control-floating-toolbar-panel-width);');
    expect(globalsSource).toContain(
      'transform: translate3d(calc(var(--control-floating-toolbar-panel-width) - var(--control-floating-toolbar-trigger-width)), 0, 0);'
    );
    expect(globalsSource).toContain(
      '.control-floating-toolbar-rail:hover .control-floating-toolbar-panel'
    );
    expect(globalsSource).toContain(
      '.control-floating-toolbar-rail:focus-within .control-floating-toolbar-panel'
    );
    expect(globalsSource).toContain('opacity 110ms cubic-bezier(0.16, 1, 0.3, 1)');
    expect(globalsSource).toContain('transform 190ms cubic-bezier(0.16, 1, 0.3, 1)');
  });
});
