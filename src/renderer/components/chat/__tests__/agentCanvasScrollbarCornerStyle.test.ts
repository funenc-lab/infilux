import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('agent canvas scrollbar corner style', () => {
  it('keeps the canvas viewport scrollable while hiding native canvas scrollbars', () => {
    expect(agentPanelSource).toContain('overflow-auto overscroll-contain touch-none');
    expect(globalsSource).toContain('scrollbar-width: none;');
    expect(globalsSource).toContain('-ms-overflow-style: none;');
    expect(globalsSource).toContain('.agent-canvas-viewport::-webkit-scrollbar');
    expect(globalsSource).toContain('width: 0;');
    expect(globalsSource).toContain('height: 0;');
    expect(globalsSource).toContain('::-webkit-scrollbar-corner');
    expect(globalsSource).toContain('background: transparent;');
  });
});
