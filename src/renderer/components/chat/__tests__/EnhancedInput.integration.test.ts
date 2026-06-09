/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnhancedInput } from '../EnhancedInput';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const focusLockTestState = vi.hoisted(() => ({
  isLocked: false,
  lockFocus: vi.fn(),
  unlockFocus: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/lib/focusLock', () => ({
  isFocusLocked: () => focusLockTestState.isLocked,
  lockFocus: focusLockTestState.lockFocus,
  unlockFocus: focusLockTestState.unlockFocus,
}));

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function installElectronApiMock() {
  const electronAPI = {
    claudeCompletions: {
      get: vi.fn(async () => ({ items: [] })),
      learn: vi.fn(async () => undefined),
      onUpdated: vi.fn(() => undefined),
    },
    file: {
      saveClipboardImageToTemp: vi.fn(async () => ({
        success: true,
        path: '/tmp/pasted-image.png',
      })),
      saveToTemp: vi.fn(async () => ({
        success: true,
        path: '/tmp/pasted-file.png',
      })),
    },
    search: {
      files: vi.fn(async () => []),
    },
    utils: {
      getPathForFile: vi.fn(() => null),
    },
  };

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: electronAPI,
  });

  return electronAPI;
}

async function mountEnhancedInput(
  overrides: Partial<React.ComponentProps<typeof EnhancedInput>> = {}
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const props: React.ComponentProps<typeof EnhancedInput> = {
    open: true,
    onOpenChange: vi.fn(),
    onSend: vi.fn(() => true),
    content: 'ni',
    attachments: [],
    onContentChange: vi.fn(),
    onAttachmentsChange: vi.fn(),
    isActive: true,
    ...overrides,
  };

  await act(async () => {
    root.render(React.createElement(EnhancedInput, props));
    await flushMicrotasks();
  });

  return {
    container,
    props,
    unmount: async () => {
      await act(async () => {
        root.unmount();
        await flushMicrotasks();
      });
      container.remove();
    },
  };
}

function createImeEnterEvent(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
  });
  Object.defineProperty(event, 'keyCode', {
    configurable: true,
    value: 229,
  });
  Object.defineProperty(event, 'which', {
    configurable: true,
    value: 229,
  });
  return event;
}

describe('EnhancedInput integration', () => {
  afterEach(() => {
    focusLockTestState.isLocked = false;
    focusLockTestState.lockFocus.mockReset();
    focusLockTestState.unlockFocus.mockReset();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('pastes a clipboard image while the session input textarea is focused without requiring Escape', async () => {
    const electronAPI = installElectronApiMock();
    const onAttachmentsChange = vi.fn();
    const mounted = await mountEnhancedInput({
      sessionId: 'session-image-paste',
      onAttachmentsChange,
    });
    const textarea = mounted.container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    if (!textarea) return;

    textarea.focus();
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [],
        types: ['image/png'],
      },
    });

    await act(async () => {
      textarea.dispatchEvent(pasteEvent);
      await flushMicrotasks();
    });

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(electronAPI.file.saveClipboardImageToTemp).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'png',
      })
    );
    expect(onAttachmentsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        path: '/tmp/pasted-image.png',
        kind: 'image',
      }),
    ]);

    await mounted.unmount();
  });

  it('lets IME Enter confirmation pass through without sending the agent message', async () => {
    const onSend = vi.fn(() => true);
    const mounted = await mountEnhancedInput({ onSend });
    const textarea = mounted.container.querySelector('textarea');
    expect(textarea).not.toBeNull();

    const event = createImeEnterEvent();
    await act(async () => {
      textarea?.dispatchEvent(event);
      await flushMicrotasks();
    });

    expect(onSend).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    await mounted.unmount();
  });

  it('does not force refocus while IME composition is active', async () => {
    focusLockTestState.isLocked = true;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    const mounted = await mountEnhancedInput({ sessionId: 'session-ime' });
    const textarea = mounted.container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    if (!textarea) return;

    const focusSpy = vi.spyOn(textarea, 'focus');
    textarea.focus();
    focusSpy.mockClear();

    await act(async () => {
      textarea.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      textarea.blur();
      await flushMicrotasks();
    });

    expect(focusSpy).not.toHaveBeenCalled();

    await mounted.unmount();
  });

  it('restores focus on blur when focus lock is active and IME is not composing', async () => {
    focusLockTestState.isLocked = true;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    const mounted = await mountEnhancedInput({ sessionId: 'session-focus' });
    const textarea = mounted.container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    if (!textarea) return;

    const focusSpy = vi.spyOn(textarea, 'focus');
    textarea.focus();
    focusSpy.mockClear();

    await act(async () => {
      textarea.blur();
      await flushMicrotasks();
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);

    await mounted.unmount();
  });
});
