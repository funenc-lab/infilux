import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sessionBarSource = [
  readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8'),
  readFileSync(resolve(currentDir, '../controlButtonStyles.ts'), 'utf8'),
].join('\n');

describe('SessionBar floating accessibility and structure', () => {
  it('keeps the floating session bar persistence model', () => {
    expect(sessionBarSource).toContain("const STORAGE_KEY = 'enso-session-bar'");
    expect(sessionBarSource).toContain('collapsed: boolean');
    expect(sessionBarSource).toContain("edge: 'left' | 'right' | null");
  });

  it('exposes session tabs as a semantic tablist', () => {
    expect(sessionBarSource).toContain('role="tablist"');
    expect(
      sessionBarSource.includes('role="tab"') || sessionBarSource.includes("role: 'tab' as const")
    ).toBe(true);
    expect(
      sessionBarSource.includes('aria-selected={isActive}') ||
        sessionBarSource.includes("'aria-selected': isActive")
    ).toBe(true);
    expect(
      sessionBarSource.includes('aria-controls={panelId}') ||
        sessionBarSource.includes("'aria-controls': panelId")
    ).toBe(true);
    expect(sessionBarSource).toContain('control-session-completion-dot');
    expect(sessionBarSource).toContain('clearTaskCompletedUnread(session.id);');
  });

  it('exposes the full session title on hover for truncated tabs', () => {
    expect(sessionBarSource).toContain('const sessionHoverTitle = getSessionHoverTitle(session);');
    const ariaLabelBindings =
      (sessionBarSource.match(/aria-label=\{sessionLabel\}/g)?.length ?? 0) +
      (sessionBarSource.match(/'aria-label':\s*sessionLabel/g)?.length ?? 0);

    expect(sessionBarSource).not.toContain('title={sessionHoverTitle}');
    expect(sessionBarSource).not.toContain('title: sessionHoverTitle');
    expect(ariaLabelBindings).toBeGreaterThanOrEqual(1);
  });

  it('renders session hover copy through shared tooltip popups instead of relying only on native titles', () => {
    expect(
      sessionBarSource.match(/<TooltipPopup[^>]*>\s*\{sessionHoverTitle\}\s*<\/TooltipPopup>/g)
        ?.length
    ).toBe(1);
  });

  it('keeps the session tab glow card as a static state frame while the indicator carries motion', () => {
    expect(sessionBarSource).toContain('<GlowCard state={glowState} as="div" {...tabProps}>');
    expect(sessionBarSource).not.toContain(
      '<GlowCard state={glowState} animated as="div" {...tabProps}>'
    );
  });

  it('renders the session tab execution indicator through the shared animated primitive', () => {
    expect(sessionBarSource).toContain("from '@/components/ui/activity-indicator'");
    expect(sessionBarSource).toContain('<ActivityIndicator');
    expect(sessionBarSource).toContain('state={visualState}');
  });

  it('keeps session tab execution animation independent from the beta glow toggle', () => {
    expect(sessionBarSource).not.toContain('useGlowEffectEnabled');
  });

  it('provides explicit labels for secondary actions', () => {
    expect(sessionBarSource).toContain("aria-label={t('Create default session')}");
    expect(sessionBarSource).toContain("aria-label={t('Choose session agent')}");
    expect(sessionBarSource).toContain("aria-label={t('Agent profiles')}");
    expect(sessionBarSource).toContain("aria-label={t('Quick Terminal')}");
  });

  it('keeps session tab color treatment on shared control-session-tab styles instead of local accent fills', () => {
    expect(sessionBarSource).toContain('control-session-tab');
    expect(sessionBarSource).not.toContain('bg-accent/50');
    expect(sessionBarSource).not.toContain('border-primary/45');
    expect(sessionBarSource).not.toContain('control-panel-muted group flex h-8 items-center gap-2');
  });

  it('keeps inactive session tabs above the muted contrast floor', () => {
    expect(sessionBarSource).toContain("isActive ? 'text-foreground' : 'text-foreground/80");
    expect(sessionBarSource).not.toContain(
      "isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
    );
  });

  it('keeps a dedicated toolbar wrapper for the floating control surface', () => {
    expect(sessionBarSource).toContain('role="toolbar"');
    expect(sessionBarSource).toContain("aria-label={t('Agent session controls')}");
  });

  it('uses a control-strip affordance for the collapsed entry instead of an AI sparkle icon', () => {
    expect(sessionBarSource).toContain("title={t('Expand session controls')}");
    expect(sessionBarSource).toContain('SESSION_BAR_COLLAPSED_BUTTON_CLASS_NAME');
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
