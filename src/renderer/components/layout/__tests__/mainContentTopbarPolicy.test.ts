import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mainContentSource } from './mainContentSource';

const currentDir = dirname(fileURLToPath(import.meta.url));
const openInMenuSource = readFileSync(resolve(currentDir, '../../app/OpenInMenu.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

function getCssSection(startMarker: string, endMarker: string): string {
  const startIndex = globalsSource.indexOf(startMarker);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = globalsSource.indexOf(endMarker, startIndex + startMarker.length);
  expect(endIndex).toBeGreaterThan(startIndex);

  return globalsSource.slice(startIndex, endIndex);
}

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

  it('keeps compact open-in controls to one dock button', () => {
    expect(openInMenuSource).toContain('if (compact) {');
    expect(openInMenuSource).not.toContain(
      "compact\n          ? 'control-floating-toolbar-open-in'"
    );
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
    expect(mainContentSource).toContain('id="floating-main-toolbar"');
    expect(mainContentSource).toContain('role="toolbar"');
    expect(mainContentSource).toContain('control-floating-toolbar-nav');
    expect(mainContentSource).not.toContain('Command');
    expect(mainContentSource).not.toContain('CircleEllipsis');
    expect(mainContentSource).not.toContain('PanelRightOpen');
    expect(mainContentSource).not.toContain('Orbit');
    expect(mainContentSource).not.toContain('control-floating-toolbar-handle');
    expect(mainContentSource).not.toContain('control-floating-toolbar-satellite');
    expect(mainContentSource).not.toContain('control-floating-toolbar-dismiss-zone');
    expect(mainContentSource).toContain("aria-label={t('Toolbar')}");
    expect(mainContentSource).toContain('title={tab.label}');
    expect(mainContentSource).toContain('control-floating-toolbar-tab');
    expect(mainContentSource).toContain('control-floating-toolbar-actions-cluster');
  });

  it('defines right-edge hover dock trigger, surface, and reveal motion styles', () => {
    const floatingToolbarPanelRuleSource = getCssSection(
      '.control-floating-toolbar-panel {',
      '\n  .dark .control-floating-toolbar-rail'
    );
    const floatingToolbarRevealRuleSource = getCssSection(
      '.control-floating-toolbar-rail:hover .control-floating-toolbar-panel',
      '\n  .control-floating-toolbar-nav'
    );

    expect(globalsSource).toContain('.control-floating-toolbar-rail {');
    expect(globalsSource).toContain('right: 0;');
    expect(globalsSource).toContain('width: var(--control-floating-toolbar-trigger-width);');
    expect(globalsSource).toContain('pointer-events: auto;');
    expect(globalsSource).toContain('--control-floating-toolbar-button-size: 2.75rem;');
    expect(globalsSource).toContain('--control-floating-toolbar-icon-size: 1.05rem;');
    expect(floatingToolbarPanelRuleSource).toContain(
      'width: var(--control-floating-toolbar-panel-width);'
    );
    expect(floatingToolbarPanelRuleSource).toContain(
      'right: var(--control-floating-toolbar-edge-gap);'
    );
    expect(floatingToolbarPanelRuleSource).toContain('border-radius: 0.875rem;');
    expect(floatingToolbarPanelRuleSource).toContain('opacity: 0;');
    expect(floatingToolbarPanelRuleSource).toContain('pointer-events: none;');
    expect(floatingToolbarPanelRuleSource).toContain(
      'transform: translate3d(calc(var(--control-floating-toolbar-panel-width) + var(--control-floating-toolbar-edge-gap) - var(--control-floating-toolbar-trigger-width)), 0, 0);'
    );
    expect(floatingToolbarPanelRuleSource).toContain(
      'box-shadow:\n      inset 0 -1px 0 var(--control-floating-toolbar-border)'
    );
    expect(floatingToolbarRevealRuleSource).toContain(
      '.control-floating-toolbar-rail:hover .control-floating-toolbar-panel'
    );
    expect(floatingToolbarRevealRuleSource).toContain(
      '.control-floating-toolbar-rail:focus-within .control-floating-toolbar-panel'
    );
    expect(floatingToolbarRevealRuleSource).toContain('opacity: 1;');
    expect(floatingToolbarRevealRuleSource).toContain('pointer-events: auto;');
    expect(floatingToolbarRevealRuleSource).toContain('transform: translate3d(0, 0, 0);');
    expect(globalsSource).toContain('height: var(--control-floating-toolbar-button-size);');
    expect(globalsSource).toContain('width: var(--control-floating-toolbar-button-size);');
    expect(globalsSource).toContain('border-radius: 0.625rem;');
    expect(floatingToolbarPanelRuleSource).toContain('opacity 90ms cubic-bezier(0.4, 0, 1, 1)');
    expect(floatingToolbarPanelRuleSource).toContain('transform 140ms cubic-bezier(0.4, 0, 1, 1)');
    expect(floatingToolbarRevealRuleSource).toContain(
      'opacity 130ms cubic-bezier(0.16, 1, 0.3, 1)'
    );
    expect(floatingToolbarRevealRuleSource).toContain(
      'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)'
    );
    expect(globalsSource).not.toContain('control-floating-toolbar-handle');
    expect(globalsSource).not.toContain('control-floating-toolbar-satellite');
    expect(globalsSource).not.toContain('control-floating-toolbar-dismiss-zone');
  });
});
