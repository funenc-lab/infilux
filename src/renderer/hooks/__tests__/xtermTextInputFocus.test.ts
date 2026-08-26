/* @vitest-environment jsdom */

import type { Terminal } from '@xterm/xterm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusXtermTextInput, installXtermImeFocusBridge } from '../xtermTextInputFocus';

const XTERM_IME_REARM_SELECTOR = 'textarea[data-infilux-xterm-ime-rearm="true"]';
const LEGACY_IME_PRIMER_SELECTOR = 'textarea[data-infilux-ime-primer="true"]';

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
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('keeps direct xterm textarea focus on the real input', () => {
    const { terminal, textarea } = createTerminalHarness();
    const bridge = installXtermImeFocusBridge(terminal);

    textarea.focus();

    expect(document.activeElement).toBe(textarea);
    expect(textarea.getAttribute('data-infilux-xterm-ime-ready')).toBe('true');
    expect(document.querySelector(XTERM_IME_REARM_SELECTOR)).toBeNull();
    expect(document.querySelector(LEGACY_IME_PRIMER_SELECTOR)).toBeNull();

    bridge.dispose();
  });

  it('prepares the real xterm textarea on focusin without retaining a competing input', () => {
    const { terminal, textarea } = createTerminalHarness();
    const bridge = installXtermImeFocusBridge(terminal);

    textarea.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(textarea.getAttribute('data-infilux-xterm-ime-ready')).toBe('true');
    expect(document.querySelector(LEGACY_IME_PRIMER_SELECTOR)).toBeNull();

    bridge.dispose();
  });

  it('focuses and prepares the xterm textarea without an intermediate input', () => {
    const { terminal, textarea } = createTerminalHarness();

    focusXtermTextInput(terminal);

    expect(terminal.focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.inputMode).toBe('text');
    expect(textarea.spellcheck).toBe(false);
    expect(textarea.getAttribute('data-infilux-xterm-ime-ready')).toBe('true');
    expect(document.querySelector(XTERM_IME_REARM_SELECTOR)).toBeNull();
    expect(document.querySelector(LEGACY_IME_PRIMER_SELECTOR)).toBeNull();
  });

  it('preserves the active textarea while native composition is in progress', () => {
    const { terminal, textarea } = createTerminalHarness();
    const bridge = installXtermImeFocusBridge(terminal);

    textarea.focus();
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(document.activeElement).toBe(textarea);

    focusXtermTextInput(terminal);

    expect(document.activeElement).toBe(textarea);
    expect(terminal.focus).not.toHaveBeenCalled();
    expect(document.querySelector(XTERM_IME_REARM_SELECTOR)).toBeNull();

    bridge.dispose();
  });

  it('restores terminal input after composition loses focus without an end event', () => {
    const { terminal, textarea } = createTerminalHarness();
    const nextFocusTarget = document.createElement('button');
    document.body.appendChild(nextFocusTarget);
    const bridge = installXtermImeFocusBridge(terminal);

    textarea.focus();
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    nextFocusTarget.focus();

    focusXtermTextInput(terminal);

    expect(document.activeElement).toBe(textarea);
    expect(terminal.focus).toHaveBeenCalledTimes(1);

    bridge.dispose();
  });

  it('clears pending composition when the owning window loses focus', () => {
    const { terminal, textarea } = createTerminalHarness();
    const bridge = installXtermImeFocusBridge(terminal);

    textarea.focus();
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));

    expect(textarea.getAttribute('data-infilux-xterm-ime-composing')).toBeNull();

    bridge.dispose();
  });

  it('removes the window focus listener when the bridge is disposed', () => {
    const { terminal, textarea } = createTerminalHarness();
    const bridge = installXtermImeFocusBridge(terminal);

    bridge.dispose();
    textarea.setAttribute('data-infilux-xterm-ime-composing', 'true');
    window.dispatchEvent(new Event('blur'));

    expect(textarea.getAttribute('data-infilux-xterm-ime-composing')).toBe('true');
  });

  it('restores explicit terminal focus after native composition ends', () => {
    const { terminal, textarea } = createTerminalHarness();
    const bridge = installXtermImeFocusBridge(terminal);

    textarea.focus();
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));

    focusXtermTextInput(terminal);

    expect(terminal.focus).toHaveBeenCalledTimes(1);

    bridge.dispose();
  });

  it('preserves an already active xterm textarea with pending native input', () => {
    const { terminal, textarea } = createTerminalHarness();
    textarea.value = 'pending';
    textarea.focus();

    focusXtermTextInput(terminal);

    expect(document.activeElement).toBe(textarea);
    expect(document.querySelector(XTERM_IME_REARM_SELECTOR)).toBeNull();
  });
});
