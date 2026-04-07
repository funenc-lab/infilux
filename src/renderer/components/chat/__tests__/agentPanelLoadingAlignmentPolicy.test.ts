import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');

describe('agent panel loading alignment policy', () => {
  it('anchors each absolute terminal host to the top edge so loading overlays stay centered', () => {
    expect(agentPanelSource).toMatch(/shouldShow\s*\?\s*'absolute [^']*top-0[^']*h-full'/);
    expect(agentPanelSource).toMatch(
      /:\s*'absolute [^']*top-0[^']*h-full[^']*opacity-0[^']*pointer-events-none'/
    );
  });
});
