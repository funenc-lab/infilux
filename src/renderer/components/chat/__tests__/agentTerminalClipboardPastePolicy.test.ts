/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  collectAgentTerminalClipboardFiles,
  hasAgentTerminalClipboardImageSignal,
  isEditableAgentTerminalClipboardPasteTarget,
  shouldCaptureAgentTerminalClipboardFiles,
} from '../agentTerminalClipboardPastePolicy';

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

  it('collects clipboard file items before falling back to file lists', () => {
    const imageFile = new File([new Uint8Array([1])], 'capture.png', { type: 'image/png' });
    const clipboardData = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => imageFile,
        },
      ],
      files: [],
    } as unknown as DataTransfer;

    expect(collectAgentTerminalClipboardFiles(clipboardData)).toEqual([imageFile]);
  });

  it('detects clipboard image signals when Chromium exposes no file item', () => {
    const clipboardData = {
      items: [],
      types: ['image/png'],
    } as unknown as DataTransfer;

    expect(hasAgentTerminalClipboardImageSignal(clipboardData)).toBe(true);
  });

  it('treats editable controls as paste owners', () => {
    const textarea = document.createElement('textarea');
    const button = document.createElement('button');

    expect(isEditableAgentTerminalClipboardPasteTarget(textarea)).toBe(true);
    expect(isEditableAgentTerminalClipboardPasteTarget(button)).toBe(false);
  });
});
