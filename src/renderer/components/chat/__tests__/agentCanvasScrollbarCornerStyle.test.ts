import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('agent canvas scrollbar corner style', () => {
  it('keeps the canvas viewport scrollable while forcing the scrollbar corner transparent', () => {
    expect(agentPanelSource).toContain('overflow-auto overscroll-contain touch-none');
    expect(globalsSource).toContain('::-webkit-scrollbar-corner');
    expect(globalsSource).toContain('background: transparent;');
  });
});
