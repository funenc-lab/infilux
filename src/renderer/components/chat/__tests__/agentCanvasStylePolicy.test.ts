import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readCssRuleBody(selector: string): string {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n  \\}`);
  const match = globalsSource.match(pattern);

  expect(match).not.toBeNull();

  return match?.[1] ?? '';
}

describe('agent canvas style policy', () => {
  it('uses dedicated canvas surface classes instead of ad hoc panel styling', () => {
    expect(agentPanelSource).toContain('agent-canvas-viewport');
    expect(agentPanelSource).toContain('agent-canvas-board');
    expect(agentPanelSource).toContain('agent-canvas-worktree-group');
    expect(agentPanelSource).toContain('agent-canvas-worktree-header');
    expect(agentPanelSource).toContain('agent-canvas-session-tile');
    expect(agentPanelSource).toContain('agent-canvas-session-terminal');
    expect(agentPanelSource).toContain('agent-canvas-floating-frame');
    expect(agentPanelSource).toContain('agent-canvas-empty-group');
  });

  it('defines token-driven canvas surfaces in the global style layer', () => {
    expect(globalsSource).toContain('.agent-canvas-viewport');
    expect(globalsSource).toContain('.agent-canvas-board');
    expect(globalsSource).toContain('.agent-canvas-worktree-group');
    expect(globalsSource).toContain('.agent-canvas-worktree-header');
    expect(globalsSource).toContain('.agent-canvas-session-tile');
    expect(globalsSource).toContain('.agent-canvas-session-terminal');
    expect(globalsSource).toContain('.agent-canvas-floating-frame');
    expect(globalsSource).toContain('.agent-canvas-empty-group');
    expect(globalsSource).toContain('var(--control-surface)');
    expect(globalsSource).toContain('var(--control-border-soft)');
  });

  it('keeps the canvas grid as a subdued background texture', () => {
    const viewportRule = readCssRuleBody('.agent-canvas-viewport');
    const gridSizeMatches = viewportRule.match(/center \/ 5rem 5rem/g);

    expect(viewportRule).toContain('var(--control-border-soft) 10%');
    expect(viewportRule).toContain('var(--control-border-soft) 8%');
    expect(viewportRule).toContain('var(--control-surface-muted) 4%');
    expect(gridSizeMatches).toHaveLength(2);
    expect(viewportRule).not.toContain('3.5rem 3.5rem');
    expect(viewportRule).not.toContain('var(--control-border-soft) 24%');
    expect(viewportRule).not.toContain('var(--control-border-soft) 20%');
  });

  it('avoids stacking full borders inside worktree canvas groups', () => {
    expect(agentPanelSource).toContain(
      "'agent-canvas-worktree-header flex min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2'"
    );
    expect(agentPanelSource).not.toContain('agent-canvas-worktree-header control-panel-muted');
    expect(agentPanelSource).not.toContain('border-dashed border-border/60');

    const worktreeHeaderRule = readCssRuleBody('.agent-canvas-worktree-header');
    const sessionTerminalRule = readCssRuleBody('.agent-canvas-session-terminal');
    const sessionTileRule = readCssRuleBody('.agent-canvas-session-tile');

    expect(worktreeHeaderRule).not.toMatch(/\bborder(?:-[a-z-]+)?\s*:/);
    expect(sessionTerminalRule).not.toMatch(/\bborder(?:-[a-z-]+)?\s*:/);
    expect(sessionTileRule).toContain('border: 1px solid transparent');
    expect(sessionTileRule).not.toMatch(/border:\s*1px solid color-mix/);
  });

  it('uses browser rendering containment for off-screen workspace canvas groups', () => {
    const worktreeGroupRule = readCssRuleBody('.agent-canvas-worktree-group');

    expect(worktreeGroupRule).toContain('content-visibility: auto');
    expect(worktreeGroupRule).toContain('contain-intrinsic-size');
  });
});
