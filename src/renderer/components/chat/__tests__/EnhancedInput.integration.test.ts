/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnhancedInput } from '../EnhancedInput';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  isFocusLocked: () => false,
  lockFocus: vi.fn(),
  unlockFocus: vi.fn(),
}));

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
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
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
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
});
