import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const enhancedInputContainerSource = readFileSync(
  resolve(currentDir, '../EnhancedInputContainer.tsx'),
  'utf8'
);
const enhancedInputSource = readFileSync(resolve(currentDir, '../EnhancedInput.tsx'), 'utf8');
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('enhanced input container send policy', () => {
  it('only clears the fallback composer after the sender reports a successful dispatch', () => {
    expect(enhancedInputContainerSource).toContain(
      'const didSend = onSend(sendContent, sendAttachments);'
    );
    expect(enhancedInputContainerSource).toContain('if (didSend) {');
    expect(enhancedInputContainerSource).toContain(
      'clearEnhancedInput(sessionId, keepOpenAfterSend);'
    );
  });

  it('keeps the fallback composer open when send dispatch is rejected or deferred', () => {
    expect(enhancedInputSource).toContain('const didSend = onSend(trimmed, attachments);');
    expect(enhancedInputSource).toContain('if (didSend && !keepOpenAfterSend) {');
    expect(enhancedInputSource).toContain('const didSend = onSend(newContent, attachments);');
  });

  it('renders an explicit awaiting-session send state before the backend session is ready', () => {
    expect(enhancedInputSource).toContain('canSend?: boolean;');
    expect(enhancedInputSource).toContain('sendHint?: string;');
    expect(enhancedInputSource).toContain("const resolvedSendLabel = sendLabel ?? t('Send');");
    expect(enhancedInputSource).toContain(
      'disabled={!canSend || (!content.trim() && attachments.length === 0)}'
    );
    expect(agentPanelSource).toContain('resolveAgentInputAvailability');
    expect(agentPanelSource).toContain("activeSessionAvailability === 'awaiting-session'");
    expect(agentPanelSource).toContain('sendHint={activeSessionSendHint}');
  });

  it('maps reconnecting and disconnected runtime states to explicit send labels', () => {
    expect(agentPanelSource).toContain("activeSessionAvailability === 'reconnecting'");
    expect(agentPanelSource).toContain("activeSessionAvailability === 'disconnected'");
    expect(agentTerminalSource).toContain(
      'primaryActionHint={resolveAgentInputUnavailableReason({'
    );
  });
});
