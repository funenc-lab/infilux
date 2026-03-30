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

  it('keeps the app runtime status entry available from the shared main topbar', () => {
    expect(mainContentSource).toContain('AppResourceStatusPopover');
  });
});
