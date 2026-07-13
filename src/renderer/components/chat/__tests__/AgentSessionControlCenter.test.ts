/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSessionInventoryItem } from '@/stores/agentSessionInventory';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, params?: Record<string, unknown>) => {
      if (!params) {
        return value;
      }
      return Object.entries(params).reduce(
        (text, [key, replacement]) => text.replace(`{{${key}}}`, String(replacement)),
        value
      );
    },
  }),
}));

vi.mock('@/components/ui/menu', () => ({
  Menu: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  MenuTrigger: ({ render }: { render: React.ReactNode }) => render,
  MenuPopup: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'session-control-menu' }, children),
}));

interface AgentSessionControlCenterProps {
  inventoryItems: AgentSessionInventoryItem[];
  onFocusSession: (sessionId: string) => void;
  scopeLabel?: string;
}

function inventoryItem(
  overrides: Partial<AgentSessionInventoryItem> & Pick<AgentSessionInventoryItem, 'sessionId'>
): AgentSessionInventoryItem {
  return {
    sessionId: overrides.sessionId,
    displayName: overrides.displayName ?? overrides.sessionId,
    agentId: overrides.agentId ?? 'codex',
    agentFamily: overrides.agentFamily ?? 'codex',
    agentName: overrides.agentName ?? 'Codex',
    agentCommand: overrides.agentCommand ?? 'codex',
    repoPath: overrides.repoPath ?? '/repo',
    cwd: overrides.cwd ?? '/repo/worktree',
    environment: overrides.environment ?? 'native',
    status: overrides.status ?? 'idle',
    isActive: overrides.isActive ?? false,
    isRecoverable: overrides.isRecoverable ?? false,
    isStale: overrides.isStale ?? false,
    lastActivityAt: overrides.lastActivityAt ?? 1,
    taskCompletionUnread: overrides.taskCompletionUnread ?? false,
    providerSessionId: overrides.providerSessionId,
    backendSessionId: overrides.backendSessionId,
    task: overrides.task,
  };
}

async function renderControlCenter(props: Partial<AgentSessionControlCenterProps> = {}) {
  const { AgentSessionControlCenter } = await import('../AgentSessionControlCenter');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onFocusSession = props.onFocusSession ?? vi.fn();

  await act(async () => {
    root.render(
      React.createElement(AgentSessionControlCenter, {
        inventoryItems: props.inventoryItems ?? [],
        onFocusSession,
        scopeLabel: props.scopeLabel ?? 'Current worktree',
      })
    );
  });

  return { container, root, onFocusSession };
}

describe('AgentSessionControlCenter', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (root && container) {
      const mountedRoot = root;
      await act(async () => {
        mountedRoot.unmount();
      });
      container.remove();
    }
    root = null;
    container = null;
  });

  it('renders session totals and task-linked rows', async () => {
    ({ container, root } = await renderControlCenter({
      inventoryItems: [
        inventoryItem({ sessionId: 'session-running', status: 'running', displayName: 'Build UI' }),
        inventoryItem({
          sessionId: 'session-waiting',
          status: 'waiting-for-input',
          displayName: 'Review API',
          agentName: 'Claude',
          agentFamily: 'claude',
          task: {
            id: 'task-1',
            title: 'Fix API review flow',
            priority: 'high',
            status: 'in-progress',
          },
        }),
      ],
    }));

    expect(container.textContent).toContain('Agent Sessions');
    expect(container.textContent).toContain('2 total');
    expect(container.textContent).toContain('1 running');
    expect(container.textContent).toContain('1 waiting');
    expect(container.textContent).toContain('Review waiting sessions');
    expect(container.textContent).toContain('Needs Attention');
    expect(container.textContent).toContain('Running Sessions');
    expect(container.textContent).toContain('Codex: 1');
    expect(container.textContent).toContain('Claude: 1');
    expect(container.textContent).toContain('Build UI');
    expect(container.textContent).toContain('Task: Fix API review flow');
  });

  it('renders reconnecting and disconnected session labels in the attention section', async () => {
    ({ container, root } = await renderControlCenter({
      inventoryItems: [
        inventoryItem({
          sessionId: 'session-reconnecting',
          status: 'reconnecting',
          displayName: 'Remote pair',
        }),
        inventoryItem({
          sessionId: 'session-disconnected',
          status: 'disconnected',
          displayName: 'Lost host',
        }),
      ],
    }));

    expect(container.textContent).toContain('Needs Attention');
    expect(container.textContent).toContain('Reconnecting');
    expect(container.textContent).toContain('Disconnected');
  });

  it('focuses the selected session', async () => {
    const onFocusSession = vi.fn();
    ({ container, root } = await renderControlCenter({
      inventoryItems: [inventoryItem({ sessionId: 'session-codex', displayName: 'Codex work' })],
      onFocusSession,
    }));

    const focusButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="focus-session-session-codex"]'
    );
    expect(focusButton).not.toBeNull();

    await act(async () => {
      focusButton?.click();
    });

    expect(onFocusSession).toHaveBeenCalledWith('session-codex');
  });

  it('reveals long session titles on hover without blocking focus actions', async () => {
    const longTitle = 'Investigate a long-running session title without losing its full context';
    const onFocusSession = vi.fn();
    ({ container, root } = await renderControlCenter({
      inventoryItems: [
        inventoryItem({
          sessionId: 'session-long-title',
          displayName: longTitle,
        }),
      ],
      onFocusSession,
    }));

    const focusButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="focus-session-session-long-title"]'
    );
    expect(focusButton).not.toBeNull();

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', window.clearTimeout);

    try {
      await act(async () => {
        focusButton?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        focusButton?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
        await vi.advanceTimersByTimeAsync(600);
      });
      await act(async () => {
        await Promise.resolve();
      });

      const tooltip = Array.from(
        document.body.querySelectorAll<HTMLElement>('[data-slot="tooltip-popup"]')
      ).find((element) => element.textContent === longTitle);
      expect(tooltip?.hasAttribute('data-open')).toBe(true);

      await act(async () => {
        focusButton?.click();
      });
      expect(onFocusSession).toHaveBeenCalledWith('session-long-title');
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
