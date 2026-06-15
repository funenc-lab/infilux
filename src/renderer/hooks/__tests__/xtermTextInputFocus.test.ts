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

  it('rearms direct xterm textarea focus with a transient IME target', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const { terminal, textarea } = createTerminalHarness();
    const bridge = installXtermImeFocusBridge(terminal);

    textarea.focus();

    const rearmTarget = document.querySelector<HTMLTextAreaElement>(XTERM_IME_REARM_SELECTOR);
    expect(rearmTarget).not.toBeNull();
    expect(document.activeElement).toBe(rearmTarget);

    frames.shift()?.(0);

    expect(terminal.focus).toHaveBeenCalledTimes(1);
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

  it('focuses and prepares the xterm textarea after transient IME rearm', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const { terminal, textarea } = createTerminalHarness();

    focusXtermTextInput(terminal);

    expect(terminal.focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      document.querySelector<HTMLTextAreaElement>(XTERM_IME_REARM_SELECTOR)
    );

    frames.shift()?.(0);

    expect(terminal.focus).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.inputMode).toBe('text');
    expect(textarea.spellcheck).toBe(false);
    expect(textarea.getAttribute('data-infilux-xterm-ime-ready')).toBe('true');
    expect(document.querySelector(XTERM_IME_REARM_SELECTOR)).toBeNull();
    expect(document.querySelector(LEGACY_IME_PRIMER_SELECTOR)).toBeNull();
  });

  it('rearms an already active empty xterm textarea', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const { terminal, textarea } = createTerminalHarness();

    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    focusXtermTextInput(terminal);

    const rearmTarget = document.querySelector<HTMLTextAreaElement>(XTERM_IME_REARM_SELECTOR);
    expect(rearmTarget).not.toBeNull();
    expect(document.activeElement).toBe(rearmTarget);

    frames.shift()?.(0);

    expect(document.activeElement).toBe(textarea);
    expect(document.querySelector(XTERM_IME_REARM_SELECTOR)).toBeNull();
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
