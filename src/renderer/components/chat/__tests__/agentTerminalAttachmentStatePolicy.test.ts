import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agent terminal attachment tray state policy', () => {
  it('keeps clipboard file paste bridged through the terminal wrapper', () => {
    expect(agentTerminalSource).toContain("wrapper.addEventListener('paste', handlePaste, true)");
    expect(agentTerminalSource).toContain("resolveAttachmentTargets(files, 'clipboard')");
  });

  it('does not depend on tray state, drag-and-drop, or hidden file pickers', () => {
    expect(agentTerminalSource).not.toContain('getAttachmentTrayState');
    expect(agentTerminalSource).not.toContain('appendAttachmentTrayAttachments');
    expect(agentTerminalSource).not.toContain('setAttachmentTrayAttachments');
    expect(agentTerminalSource).not.toContain('setAttachmentTrayImporting');
    expect(agentTerminalSource).not.toContain('clearAttachmentTray');
    expect(agentTerminalSource).toContain('insertTerminalAttachmentText');
    expect(agentTerminalSource).not.toContain('AgentAttachmentTray');
    expect(agentTerminalSource).not.toContain('useFileDrop');
    expect(agentTerminalSource).not.toContain('type="file"');
  });
});
