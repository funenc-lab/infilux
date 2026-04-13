import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');
const useXtermSource = readFileSync(resolve(currentDir, '../../../hooks/useXterm.ts'), 'utf8');

describe('agent native terminal input policy', () => {
  it('keeps the fallback composer scoped to providers without native terminal input', () => {
    expect(agentPanelSource).toContain('shouldRenderEnhancedInput');
    expect(agentPanelSource).toContain('shouldRenderEnhancedInput(session.id)');
    expect(agentPanelSource).toContain('shouldRenderEnhancedInput(activeSession.id)');
    expect(agentPanelSource).toContain('!supportsAgentNativeTerminalInput(session.agentId)');
  });

  it('routes Claude and Codex attachment paste into the terminal input instead of a composer draft', () => {
    expect(agentTerminalSource).toContain('buildAgentAttachmentInsertText');
    expect(agentTerminalSource).toContain('insertTerminalAttachmentText');
    expect(agentTerminalSource).toContain('queueTerminalAttachmentInsert');
    expect(agentTerminalSource).toContain('flushQueuedTerminalAttachmentInsert');
    expect(agentTerminalSource).toContain("disposition === 'queue'");
    expect(agentTerminalSource).toContain('submit: false,');
    expect(agentTerminalSource).toContain('supportsNativeTerminalInput');
    expect(agentTerminalSource).not.toContain('AgentAttachmentTray');
  });

  it('keeps clipboard file paste on the app-managed attachment bridge', () => {
    expect(agentTerminalSource).toContain('shouldCaptureAgentTerminalClipboardFiles');
    expect(agentTerminalSource).toContain(
      'if (!shouldCaptureAgentTerminalClipboardFiles(agentId, files)) {'
    );
  });

  it('registers the enhanced input sender without excluding native-terminal providers', () => {
    expect(agentTerminalSource).toContain(
      'onRegisterEnhancedInputSender?.(terminalSessionId, handleEnhancedInputSend);'
    );
    expect(agentTerminalSource).not.toContain(
      'if (!terminalSessionId || supportsAgentNativeTerminalInput(agentId)) return;'
    );
  });

  it('starts session output monitoring independently from the beta glow toggle', () => {
    expect(agentTerminalSource).toContain('if (terminalSessionId) {');
    expect(agentTerminalSource).toContain('startActivityPolling();');
    expect(agentTerminalSource).not.toContain('if (terminalSessionId && glowEffectEnabled) {');
  });

  it('rejects oversized pasted attachments instead of routing them into a hidden tray', () => {
    expect(agentTerminalSource).toContain('showOversizedAttachmentWarning');
    expect(agentTerminalSource).toContain('file.size > DRAFT_ATTACHMENT_MAX_BYTES');
    expect(agentTerminalSource).not.toContain('setAttachmentTrayImporting');
  });

  it('keeps agent sessions in transcript mode so pointer and wheel gestures do not move the cursor into the output region', () => {
    expect(useXtermSource).toContain('attachAgentTranscriptMode');
    expect(useXtermSource).toContain('attachAgentTranscriptMode(nextTerminal, kind)');
  });
});
