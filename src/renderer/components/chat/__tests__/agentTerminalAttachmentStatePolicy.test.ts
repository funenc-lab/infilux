import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agent terminal attachment tray state policy', () => {
  it('reads tray state through the stable store accessor instead of allocating fallback arrays', () => {
    expect(agentTerminalSource).toContain('getAttachmentTrayState');
    expect(agentTerminalSource).not.toContain('attachments ?? []');
    expect(agentTerminalSource).not.toContain(
      'attachmentTrayStates[terminalSessionId]?.attachments ?? []'
    );
  });
});
