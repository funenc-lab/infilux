import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyTerminalSelectionToClipboard,
  getTerminalSelectionText,
  readClipboardText,
  shouldHandleTerminalCopyEvent,
  writeClipboardText,
} from '../xtermClipboard';

describe('xtermClipboard', () => {
  const originalNavigator = globalThis.navigator;
  const writeText = vi.fn();
  const readText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    readText.mockReset();
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      clipboard: {
        writeText,
        readText,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the current selection when xterm reports one', () => {
    expect(
      getTerminalSelectionText({
        hasSelection: () => true,
        getSelection: () => 'copied text',
      })
    ).toBe('copied text');
  });

  it('returns null when xterm does not have a selection', () => {
    expect(
      getTerminalSelectionText({
        hasSelection: () => false,
        getSelection: () => 'ignored',
      })
    ).toBeNull();
  });

  it('handles copy events only when they originate inside the terminal container', () => {
    const inside = new EventTarget();
    const outside = new EventTarget();
    const container = {
      contains: vi.fn((candidate: unknown) => candidate === inside),
    } as unknown as HTMLElement;

    expect(
      shouldHandleTerminalCopyEvent({
        container,
        eventTarget: inside,
        activeElement: outside,
        domSelectionText: '',
        selectionText: 'selected output',
      })
    ).toBe(true);

    expect(
      shouldHandleTerminalCopyEvent({
        container,
        eventTarget: outside,
        activeElement: outside,
        domSelectionText: 'external selection',
        selectionText: 'selected output',
      })
    ).toBe(false);

    expect(container.contains).toHaveBeenCalledTimes(3);
  });

  it('handles unfocused terminal copy events when no outside editable element or DOM selection exists', () => {
    const containerTarget = new EventTarget();
    const bodyLikeTarget = new EventTarget();
    const container = {
      contains: vi.fn((candidate: unknown) => candidate === containerTarget),
    } as unknown as HTMLElement;

    expect(
      shouldHandleTerminalCopyEvent({
        container,
        eventTarget: bodyLikeTarget,
        activeElement: { tagName: 'BODY', isContentEditable: false } as unknown as EventTarget,
        domSelectionText: ' \n ',
        selectionText: 'selected output',
      })
    ).toBe(true);
  });

  it('does not hijack copy events from editable elements outside the terminal', () => {
    const outside = new EventTarget();
    const container = {
      contains: vi.fn(() => false),
    } as unknown as HTMLElement;

    expect(
      shouldHandleTerminalCopyEvent({
        container,
        eventTarget: outside,
        activeElement: { tagName: 'TEXTAREA', isContentEditable: false } as unknown as EventTarget,
        domSelectionText: '',
        selectionText: 'selected output',
      })
    ).toBe(false);
  });

  it('writes selected terminal output to the clipboard', async () => {
    writeText.mockResolvedValue(undefined);

    await expect(
      copyTerminalSelectionToClipboard({
        hasSelection: () => true,
        getSelection: () => 'terminal output',
      })
    ).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('terminal output');
  });

  it('returns false when there is no terminal selection to copy', async () => {
    await expect(
      copyTerminalSelectionToClipboard({
        hasSelection: () => false,
        getSelection: () => '',
      })
    ).resolves.toBe(false);

    expect(writeText).not.toHaveBeenCalled();
  });

  it('reads clipboard text through the browser clipboard API', async () => {
    readText.mockResolvedValue('pasted output');

    await expect(readClipboardText()).resolves.toBe('pasted output');
    expect(readText).toHaveBeenCalledTimes(1);
  });

  it('writes clipboard text through the browser clipboard API', async () => {
    writeText.mockResolvedValue(undefined);

    await expect(writeClipboardText('copied output')).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith('copied output');
  });
});
