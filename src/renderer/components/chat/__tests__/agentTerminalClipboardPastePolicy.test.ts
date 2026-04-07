import { describe, expect, it } from 'vitest';
import { shouldCaptureAgentTerminalClipboardFiles } from '../agentTerminalClipboardPastePolicy';

describe('agentTerminalClipboardPastePolicy', () => {
  it('captures clipboard image paste for Claude sessions', () => {
    expect(shouldCaptureAgentTerminalClipboardFiles('claude', [{ type: 'image/png' }])).toBe(true);
  });

  it('captures clipboard image paste for Codex sessions in the embedded terminal', () => {
    expect(shouldCaptureAgentTerminalClipboardFiles('codex', [{ type: 'image/png' }])).toBe(true);
    expect(shouldCaptureAgentTerminalClipboardFiles('codex-happy', [{ type: 'image/jpeg' }])).toBe(
      true
    );
  });

  it('continues capturing non-image clipboard files for Codex sessions', () => {
    expect(shouldCaptureAgentTerminalClipboardFiles('codex', [{ type: 'application/pdf' }])).toBe(
      true
    );
  });

  it('returns false when there are no clipboard files to process', () => {
    expect(shouldCaptureAgentTerminalClipboardFiles('codex', [])).toBe(false);
  });
});
