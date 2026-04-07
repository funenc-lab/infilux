import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');
const useXtermSource = readFileSync(resolve(currentDir, '../../../hooks/useXterm.ts'), 'utf8');

describe('agent native terminal input policy', () => {
  it('keeps native-terminal providers out of the enhanced composer surface', () => {
    expect(agentPanelSource).toContain('supportsAgentNativeTerminalInput');
    expect(agentPanelSource).toContain('!supportsAgentNativeTerminalInput(activeSession.agentId)');
  });

  it('inserts Claude and Codex attachments into the terminal input buffer instead of routing them through the composer', () => {
    expect(agentTerminalSource).toContain('supportsAgentNativeTerminalInput(agentId)');
    expect(agentTerminalSource).toContain('buildAgentAttachmentInsertText');
    expect(agentTerminalSource).toContain('insertTerminalAttachmentText');
    expect(agentTerminalSource).toContain(
      'const didInsert = insertTerminalAttachmentText(trayAttachments);'
    );
  });

  it('keeps clipboard file paste on the app-managed attachment bridge', () => {
    expect(agentTerminalSource).toContain('shouldCaptureAgentTerminalClipboardFiles');
    expect(agentTerminalSource).toContain(
      'if (!shouldCaptureAgentTerminalClipboardFiles(agentId, files)) {'
    );
  });

  it('blocks direct attachment insertion only when the current session is outputting, not when another worktree session is running', () => {
    expect(agentTerminalSource).toContain('canInsertAgentTerminalAttachments');
    expect(agentTerminalSource).toContain('outputState: outputStateRef.current');
    expect(agentTerminalSource).not.toContain("getActivityState(cwd) === 'running'");
  });

  it('starts session output monitoring independently from the beta glow toggle', () => {
    expect(agentTerminalSource).toContain('if (terminalSessionId) {');
    expect(agentTerminalSource).toContain('startActivityPolling();');
    expect(agentTerminalSource).not.toContain('if (terminalSessionId && glowEffectEnabled) {');
  });

  it('shows explicit reconnecting and disconnected tray labels when native terminal input is unavailable', () => {
    expect(agentTerminalSource).toContain('resolveAgentInputAvailability');
    expect(agentTerminalSource).toContain("agentInputAvailability === 'reconnecting'");
    expect(agentTerminalSource).toContain("agentInputAvailability === 'disconnected'");
    expect(agentTerminalSource).toContain(
      'primaryActionHint={resolveAgentInputUnavailableReason({'
    );
  });

  it('keeps agent sessions in transcript mode so pointer and wheel gestures do not move the cursor into the output region', () => {
    expect(useXtermSource).toContain('attachAgentTranscriptMode');
    expect(useXtermSource).toContain('attachAgentTranscriptMode(nextTerminal, kind)');
  });
});
