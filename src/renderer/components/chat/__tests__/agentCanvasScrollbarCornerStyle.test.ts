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

function readOptionalCssRuleBody(selector: string): string | null {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n  \\}`);
  const match = globalsSource.match(pattern);

  return match?.[1] ?? null;
}

describe('agent canvas scrollbar corner style', () => {
  it('keeps the canvas viewport scrollable through native scrollbar dragging', () => {
    const viewportRule = readCssRuleBody('.agent-canvas-viewport');
    const webkitScrollbarRule =
      readOptionalCssRuleBody('.agent-canvas-viewport::-webkit-scrollbar') ?? '';

    expect(agentPanelSource).toContain('overflow-auto overscroll-contain touch-none');
    expect(viewportRule).not.toContain('scrollbar-width: none;');
    expect(viewportRule).not.toContain('-ms-overflow-style: none;');
    expect(viewportRule).not.toContain('width: 0;');
    expect(viewportRule).not.toContain('height: 0;');
    expect(webkitScrollbarRule).not.toContain('width: 0;');
    expect(webkitScrollbarRule).not.toContain('height: 0;');
    expect(globalsSource).toContain('::-webkit-scrollbar-corner');
    expect(globalsSource).toContain('background: transparent;');
  });
});
