import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentFloatingControlLayoutSource = readFileSync(
  resolve(currentDir, '../agentFloatingControlLayout.ts'),
  'utf8'
);
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agent terminal floating control layout', () => {
  it('keeps the scroll-to-bottom control independent from any attachment launcher', () => {
    expect(agentFloatingControlLayoutSource).toContain('AGENT_CHAT_SCROLL_TO_BOTTOM_OFFSET_CLASS');
    expect(agentFloatingControlLayoutSource).not.toContain('bottom-[calc(');
    expect(agentTerminalSource).toContain('AGENT_CHAT_SCROLL_TO_BOTTOM_OFFSET_CLASS');
    expect(agentTerminalSource).not.toContain("from './AgentAttachmentTray'");
  });
});
