/* @vitest-environment jsdom */

import type { Terminal } from '@xterm/xterm';
import { describe, expect, it, vi } from 'vitest';
import { focusXtermTextInput, installXtermImeFocusBridge } from '../xtermTextInputFocus';

function createTerminalHarness() {
  const element = document.createElement('div');
  const textarea = document.createElement('textarea');
  element.appendChild(textarea);
  document.body.appendChild(element);

  const terminal = {
    element,
    textarea,
    focus: vi.fn(),
  } as unknown as Terminal;

  return { element, terminal, textarea };
}

describe('xterm text input focus', () => {
  it('keeps the real xterm textarea as the only IME target on focusin', () => {
    const { terminal, textarea } = createTerminalHarness();
    const bridge = installXtermImeFocusBridge(terminal);

    textarea.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(textarea.getAttribute('data-infilux-xterm-ime-ready')).toBe('true');
    expect(document.querySelector('textarea[data-infilux-ime-primer="true"]')).toBeNull();

    bridge.dispose();
  });

  it('focuses and prepares the xterm textarea without hidden competing inputs', () => {
    const { terminal, textarea } = createTerminalHarness();

    focusXtermTextInput(terminal);

    expect(terminal.focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.inputMode).toBe('text');
    expect(textarea.spellcheck).toBe(false);
    expect(textarea.getAttribute('data-infilux-xterm-ime-ready')).toBe('true');
    expect(document.querySelector('textarea[data-infilux-ime-primer="true"]')).toBeNull();
  });
});
