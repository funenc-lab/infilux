import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(currentDir, '../../../App.tsx'), 'utf8');
const hoverRevealGroupSource = readFileSync(
  resolve(currentDir, '../SidebarHoverRevealGroup.tsx'),
  'utf8'
);
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

const hoverRevealShadowScale = {
  edgeWidth: 1,
  edgeStrength: 72,
  contactOffset: 6,
  contactBlur: 14,
  contactStrength: 8,
  ambientOffset: 14,
  ambientBlur: 28,
  ambientStrength: 4,
  verticalOffset: 2,
  verticalBlur: 10,
  verticalStrength: 5,
  darkContactStrength: 40,
  darkAmbientStrength: 20,
  darkVerticalStrength: 28,
} as const;

function expectShadowColorVariable(
  variableName: string,
  sourceToken: string,
  strength: number
): void {
  expect(globalsSource).toMatch(
    new RegExp(
      `${variableName}: color-mix\\(\\s*in oklch,\\s*var\\(${sourceToken}\\) ${strength}%,\\s*transparent\\s*\\);`
    )
  );
}

function getCssSection(startMarker: string, endMarker: string): string {
  const startIndex = globalsSource.indexOf(startMarker);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = globalsSource.indexOf(endMarker, startIndex + startMarker.length);
  expect(endIndex).toBeGreaterThan(startIndex);

  return globalsSource.slice(startIndex, endIndex);
}

function getHoverRevealContentRuleSource(): string {
  return getCssSection(
    ".control-sidebar-hover-rail[data-sidebar-hover-reveal='active']\n    > [data-sidebar-hover-content='true'] {",
    '\n  .dark'
  );
}

function getHoverRevealOpenStateRuleSource(): string {
  return getCssSection(
    ".control-sidebar-hover-reveal-group[data-sidebar-hover-reveal-state='open']\n    .control-sidebar-hover-rail[data-sidebar-hover-reveal='active']\n    > [data-sidebar-hover-content='true'] {",
    '\n  @media (prefers-reduced-motion: reduce)'
  );
}

function expectCssDeclaration(source: string, propertyName: string, valuePattern: string): void {
  expect(source).toMatch(new RegExp(`${propertyName}:\\s*${valuePattern}\\s*;`));
}

describe('sidebar hover reveal style policy', () => {
  it('connects the persisted setting to auto-hidden sidebar layout frames', () => {
    expect(appSource).toContain('floatingSidebarEnabled');
    expect(appSource).not.toContain('floatingSidebarActive');
    expect(appSource).toContain('resolveSidebarHoverRevealFrame');
    expect(appSource).toContain('<SidebarHoverRevealGroup enabled={floatingSidebarEnabled}>');
    expect(appSource).toContain('repositorySidebarFrame');
    expect(appSource).toMatch(/width: frame\.trackWidth/);
    expect(hoverRevealGroupSource).toMatch(
      /'--control-sidebar-hover-edge-gap': `\$\{SIDEBAR_HOVER_REVEAL_FLOATING_GAP\}px`/
    );
    expect(appSource).toMatch(
      /'--control-sidebar-hover-trigger-width': `\$\{frame\.triggerWidth\}px`/
    );
    expect(appSource).toMatch(/'--control-sidebar-hover-panel-width': `\$\{frame\.panelWidth\}px`/);
    expect(appSource).toMatch(
      /'--control-sidebar-hover-panel-offset': `\$\{panelOffset\}px`/
    );
    expect(appSource).not.toContain('width: repositorySidebarFrame.trackWidth');
    expect(appSource).not.toContain('width: worktreeSidebarFrame.trackWidth');
    expect(appSource).toContain('data-sidebar-hover-content="true"');
    expect(appSource).toContain(
      "data-sidebar-hover-reveal={repositorySidebarFrame.floating ? 'active' : undefined}"
    );
    expect(appSource).toContain(
      "data-sidebar-hover-reveal={worktreeSidebarFrame.floating ? 'active' : undefined}"
    );
  });

  it('keeps the hidden trigger out of normal layout flow so the canvas can reach the left edge', () => {
    expect(hoverRevealGroupSource).toMatch(
      /const className = enabled\s+\?\s+'control-sidebar-hover-reveal-group absolute left-0 top-0 z-30 flex h-full shrink-0 overflow-visible'\s+:\s+'flex h-full shrink-0';/
    );
    expect(appSource).not.toContain('className="flex h-full shrink-0"');
  });

  it('adds visual floating space without moving the left-edge trigger away from the screen edge', () => {
    expect(globalsSource).toContain(
      ".control-sidebar-hover-reveal-group[data-sidebar-hover-reveal-group='active']"
    );
    expect(globalsSource).toContain('padding-block: var(--control-sidebar-hover-edge-gap);');
    expect(globalsSource).toContain('padding-inline-start: 0;');
    expect(globalsSource).toContain('padding-inline-end: var(--control-sidebar-hover-edge-gap);');
    expect(globalsSource).toContain('margin-inline-start: var(--control-sidebar-hover-edge-gap);');
    expect(globalsSource).toContain('border-radius: 0.625rem;');
    expect(globalsSource).not.toContain('border-radius: 0 0.625rem 0.625rem 0;');
  });

  it('uses proportioned elevation so the floating sidebar separates without looking heavy', () => {
    expect(hoverRevealShadowScale.ambientBlur).toBe(hoverRevealShadowScale.contactBlur * 2);
    expect(hoverRevealShadowScale.contactStrength).toBe(hoverRevealShadowScale.ambientStrength * 2);
    expect(hoverRevealShadowScale.darkContactStrength).toBe(
      hoverRevealShadowScale.darkAmbientStrength * 2
    );
    expect(hoverRevealShadowScale.ambientBlur).toBeLessThanOrEqual(28);
    expect(hoverRevealShadowScale.verticalBlur).toBeLessThan(hoverRevealShadowScale.contactBlur);

    expectShadowColorVariable(
      '--control-sidebar-hover-shadow-edge',
      '--border',
      hoverRevealShadowScale.edgeStrength
    );
    expectShadowColorVariable(
      '--control-sidebar-hover-shadow-contact',
      '--foreground',
      hoverRevealShadowScale.contactStrength
    );
    expectShadowColorVariable(
      '--control-sidebar-hover-shadow-ambient',
      '--foreground',
      hoverRevealShadowScale.ambientStrength
    );
    expectShadowColorVariable(
      '--control-sidebar-hover-shadow-vertical',
      '--foreground',
      hoverRevealShadowScale.verticalStrength
    );
    expectShadowColorVariable(
      '--control-sidebar-hover-shadow-contact',
      '--background',
      hoverRevealShadowScale.darkContactStrength
    );
    expectShadowColorVariable(
      '--control-sidebar-hover-shadow-ambient',
      '--background',
      hoverRevealShadowScale.darkAmbientStrength
    );
    expectShadowColorVariable(
      '--control-sidebar-hover-shadow-vertical',
      '--background',
      hoverRevealShadowScale.darkVerticalStrength
    );
    expect(globalsSource).toContain(
      `${hoverRevealShadowScale.edgeWidth}px 0 0 var(--control-sidebar-hover-shadow-edge)`
    );
    expect(globalsSource).toContain(
      `0 ${hoverRevealShadowScale.verticalOffset}px ${hoverRevealShadowScale.verticalBlur}px var(--control-sidebar-hover-shadow-vertical)`
    );
    expect(globalsSource).toContain(
      `0 -${hoverRevealShadowScale.verticalOffset}px ${hoverRevealShadowScale.verticalBlur}px var(--control-sidebar-hover-shadow-vertical)`
    );
    expect(globalsSource).toContain(
      `${hoverRevealShadowScale.contactOffset}px 0 ${hoverRevealShadowScale.contactBlur}px var(--control-sidebar-hover-shadow-contact)`
    );
    expect(globalsSource).toContain(
      `${hoverRevealShadowScale.ambientOffset}px 0 ${hoverRevealShadowScale.ambientBlur}px var(--control-sidebar-hover-shadow-ambient)`
    );
    expect(globalsSource).toContain('inset 0 -1px 0 var(--control-sidebar-hover-border)');
    expect(globalsSource).toContain(
      'inset 0 1px 0 color-mix(in oklch, var(--control-sidebar-hover-border) 64%, transparent)'
    );
    expect(globalsSource).not.toContain(
      '10px 0 24px color-mix(in oklch, var(--foreground) 16%, transparent)'
    );
    expect(globalsSource).not.toContain(
      '24px 0 52px color-mix(in oklch, var(--background) 58%, transparent)'
    );
    expect(globalsSource).not.toContain(
      'box-shadow: 6px 0 14px color-mix(in oklch, var(--background) 30%, transparent);'
    );
  });

  it('uses a distinct floating surface without changing the normal sidebar token', () => {
    const hoverRevealContentRuleSource = getHoverRevealContentRuleSource();

    expect(hoverRevealContentRuleSource).toContain('--control-sidebar-hover-surface: color-mix(');
    expect(hoverRevealContentRuleSource).toContain('var(--control-surface-muted) 62%,');
    expect(hoverRevealContentRuleSource).toContain('var(--sidebar) 38%');
    expect(hoverRevealContentRuleSource).toContain('--control-sidebar-hover-border: color-mix(');
    expect(hoverRevealContentRuleSource).toContain(
      'background: var(--control-sidebar-hover-surface);'
    );
    expect(globalsSource).toContain(
      ".control-sidebar-hover-rail[data-sidebar-hover-reveal='active']\n    > [data-sidebar-hover-content='true']\n    .control-sidebar {"
    );
    expect(globalsSource).toContain('border-color: var(--control-sidebar-hover-border);');
    expect(globalsSource).toContain('var(--control-surface-muted) 58%,');
    expect(globalsSource).not.toMatch(
      /\.control-sidebar\s*\{[\s\S]*--sidebar:\s*var\(--control-sidebar-hover-surface\)/
    );
  });

  it('uses fast eased motion for hover reveal without layout animation', () => {
    const hoverRevealContentRuleSource = getHoverRevealContentRuleSource();
    const hoverRevealOpenRuleSource = getHoverRevealOpenStateRuleSource();

    expect(hoverRevealContentRuleSource).toContain('will-change: opacity, transform;');
    expectCssDeclaration(
      hoverRevealContentRuleSource,
      'transform',
      'translate3d\\(\\s*calc\\(-1 \\* var\\(--control-sidebar-hover-panel-width\\) - var\\(--control-sidebar-hover-edge-gap\\) \\+ var\\(--control-sidebar-hover-trigger-width\\)\\),\\s*0,\\s*0\\s*\\)'
    );
    expect(hoverRevealContentRuleSource).toContain('opacity 90ms cubic-bezier(0.4, 0, 1, 1)');
    expect(hoverRevealContentRuleSource).toContain('transform 140ms cubic-bezier(0.4, 0, 1, 1)');
    expect(hoverRevealOpenRuleSource).toContain('opacity 130ms cubic-bezier(0.16, 1, 0.3, 1)');
    expect(hoverRevealOpenRuleSource).toContain('transform 220ms cubic-bezier(0.16, 1, 0.3, 1)');
    expectCssDeclaration(
      hoverRevealOpenRuleSource,
      'transform',
      'translate3d\\(var\\(--control-sidebar-hover-panel-offset\\), 0, 0\\)'
    );
    expect(hoverRevealContentRuleSource).not.toContain('opacity 140ms ease');
    expect(hoverRevealContentRuleSource).not.toContain('transform 180ms ease');
    expect(hoverRevealContentRuleSource).not.toContain('transition: opacity 80ms ease;');
  });

  it('offsets the worktree floating panel after the repository panel in columns layout', () => {
    expect(appSource).toContain('const worktreeSidebarFloatingOffset =');
    expect(appSource).toContain(
      'repositorySidebarFrame.panelWidth - repositorySidebarFrame.trackWidth'
    );
    expect(appSource).toMatch(
      /style=\{getSidebarHoverRevealStyle\(\s*worktreeSidebarFrame,\s*worktreeSidebarFloatingOffset\s*\)\}/
    );
  });

  it('keeps the full sidebar hidden until pointer or keyboard focus enters the left edge', () => {
    expect(globalsSource).toContain('.control-sidebar-hover-rail[data-sidebar-hover-reveal=');
    expect(globalsSource).toContain("[data-sidebar-hover-content='true']");
    expect(globalsSource).toContain("[data-sidebar-hover-reveal-state='open']");
    expect(globalsSource).toContain('width: var(--control-sidebar-hover-trigger-width);');
    expect(globalsSource).toContain('min-width: var(--control-sidebar-hover-trigger-width);');
    expect(globalsSource).toContain('pointer-events: none;');
    expect(globalsSource).toContain('pointer-events: auto;');
    expect(globalsSource).toContain('width: var(--control-sidebar-hover-panel-width);');
    expect(globalsSource).not.toContain('[data-collapsed-sidebar]');
  });

  it('uses explicit reveal state instead of raw hover css so selection drags can stay closed', () => {
    expect(hoverRevealGroupSource).toMatch(
      /onPointerEnter=\{enabled \? handlePointerEvent : undefined\}/
    );
    expect(hoverRevealGroupSource).toMatch(
      /onPointerMove=\{enabled \? handlePointerEvent : undefined\}/
    );
    expect(hoverRevealGroupSource).toMatch(/onFocusCapture=\{enabled \? handleFocus : undefined\}/);
    expect(hoverRevealGroupSource).toContain(
      "window.addEventListener('focus', syncAfterWindowFocus);"
    );
    expect(hoverRevealGroupSource).toContain('shouldOpenSidebarHoverReveal');
    expect(hoverRevealGroupSource).toContain('shouldSyncSidebarHoverRevealAfterWindowFocus');
    expect(globalsSource).not.toContain(
      ".control-sidebar-hover-rail[data-sidebar-hover-reveal='active']:hover"
    );
    expect(globalsSource).not.toContain(
      ".control-sidebar-hover-rail[data-sidebar-hover-reveal='active']:focus-within"
    );
  });

  it('hides top collapse buttons while sidebars are floating', () => {
    expect(appSource).toMatch(
      /const repositorySidebarCollapseHandler = repositorySidebarFrame\.floating\s*\?\s*undefined\s*:\s*handleRepositorySidebarCollapse;/
    );
    expect(appSource).toMatch(
      /const worktreeSidebarCollapseHandler = worktreeSidebarFrame\.floating\s*\?\s*undefined\s*:\s*handleWorktreeSidebarCollapse;/
    );
    expect(appSource.match(/onCollapse=\{repositorySidebarCollapseHandler\}/g)).toHaveLength(2);
    expect(appSource.match(/onCollapse=\{worktreeSidebarCollapseHandler\}/g)).toHaveLength(2);
    expect(appSource).not.toContain('onCollapse={handleRepositorySidebarCollapse}');
    expect(appSource).not.toContain('onCollapse={handleWorktreeSidebarCollapse}');
  });
});
