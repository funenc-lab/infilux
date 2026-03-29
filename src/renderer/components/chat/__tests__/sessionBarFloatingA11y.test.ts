import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');

describe('SessionBar floating accessibility and structure', () => {
  it('keeps the floating session bar persistence model', () => {
    expect(sessionBarSource).toContain("const STORAGE_KEY = 'enso-session-bar'");
    expect(sessionBarSource).toContain('collapsed: boolean');
    expect(sessionBarSource).toContain("edge: 'left' | 'right' | null");
  });

  it('exposes session tabs as a semantic tablist', () => {
    expect(sessionBarSource).toContain('role="tablist"');
    expect(sessionBarSource).toContain('role="tab"');
    expect(sessionBarSource).toContain('aria-selected={isActive}');
    expect(sessionBarSource).toContain('aria-controls={panelId}');
    expect(sessionBarSource).toContain('control-session-completion-dot');
    expect(sessionBarSource).toContain('clearTaskCompletedUnread(session.id);');
  });

  it('provides explicit labels for secondary actions', () => {
    expect(sessionBarSource).toContain("aria-label={t('Create default session')}");
    expect(sessionBarSource).toContain("aria-label={t('Choose session agent')}");
    expect(sessionBarSource).toContain("aria-label={t('Agent profiles')}");
    expect(sessionBarSource).toContain("aria-label={t('Quick Terminal')}");
  });

  it('keeps a dedicated toolbar wrapper for the floating control surface', () => {
    expect(sessionBarSource).toContain('role="toolbar"');
    expect(sessionBarSource).toContain("aria-label={t('Agent session controls')}");
  });

  it('uses a control-strip affordance for the collapsed entry instead of an AI sparkle icon', () => {
    expect(sessionBarSource).toContain("title={t('Expand session controls')}");
    expect(sessionBarSource).toContain(
      '<RectangleEllipsis className="h-4 w-4 text-muted-foreground" />'
    );
    expect(sessionBarSource).not.toContain(
      '<Sparkles className="h-4 w-4 text-muted-foreground" />'
    );
  });

  it('aligns the agent creation dropdown to the action edge with shared menu items', () => {
    expect(sessionBarSource).toContain('absolute right-0 z-50 min-w-40');
    expect(sessionBarSource).toContain('origin-top-right');
    expect(sessionBarSource).toContain('origin-bottom-right');
    expect(sessionBarSource).toContain('control-menu-item');
  });

  it('avoids decorative header summary text and provider name labels', () => {
    expect(sessionBarSource).not.toContain("<span>{repoLabel ?? 'AI'}</span>");
    expect(sessionBarSource).not.toContain('activeSessionMeta.shortLabel');
    expect(sessionBarSource).not.toContain('truncateProviderName(activeProvider.name)');
  });

  it('uses click-triggered menus with outside-click dismissal instead of hover popups', () => {
    expect(sessionBarSource).toContain('const handleToggleAgentMenu = useCallback(() => {');
    expect(sessionBarSource).toContain('const handleToggleProviderMenu = useCallback(() => {');
    expect(sessionBarSource).toContain('const handleCreateDefaultSession = useCallback(() => {');
    expect(sessionBarSource).toContain('onNewSession();');
    expect(sessionBarSource).toContain(
      "document.addEventListener('pointerdown', handlePointerDown)"
    );
    expect(sessionBarSource).not.toContain('onMouseEnter={handleAddMouseEnter}');
    expect(sessionBarSource).not.toContain('onMouseEnter={() => setShowProviderMenu(true)}');
  });
});
