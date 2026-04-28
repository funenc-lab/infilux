/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitTodoPersistenceFailure } from '@/lib/todoPersistenceEvents';
import { useTodoPersistenceNotifications } from '../useTodoPersistenceNotifications';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const notificationTestDoubles = vi.hoisted(() => ({
  toastAdd: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: notificationTestDoubles.toastAdd,
  },
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params
        ? key.replace(/\{\{(\w+)\}\}/g, (match, token) =>
            params[token] === undefined ? match : String(params[token])
          )
        : key,
  }),
}));

function Harness() {
  useTodoPersistenceNotifications();
  return React.createElement('div');
}

function mountHarness() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(React.createElement(Harness));
  });

  return {
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useTodoPersistenceNotifications', () => {
  beforeEach(() => {
    notificationTestDoubles.toastAdd.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows a rollback toast for todo persistence failures and unsubscribes on unmount', () => {
    const harness = mountHarness();

    act(() => {
      emitTodoPersistenceFailure({
        errorMessage: 'write failed',
        operation: 'update',
        repoPath: '/repo/main',
      });
    });

    expect(notificationTestDoubles.toastAdd).toHaveBeenCalledWith({
      title: 'Todo change was not saved',
      description: 'Task update failed. The local change was rolled back.\nDetails: write failed',
      type: 'error',
      timeout: 10000,
    });

    harness.unmount();
    notificationTestDoubles.toastAdd.mockClear();

    act(() => {
      emitTodoPersistenceFailure({
        errorMessage: 'write failed',
        operation: 'delete',
        repoPath: '/repo/main',
      });
    });

    expect(notificationTestDoubles.toastAdd).not.toHaveBeenCalled();
  });
});
