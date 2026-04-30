/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TodoTaskFocusRequest } from '../KanbanBoard';
import { TodoPanel } from '../TodoPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/layout/ControlStateCard', async () => {
  const ReactModule = await import('react');

  return {
    ControlStateCard: ({ title }: { title: string }) =>
      ReactModule.createElement('section', { 'data-testid': 'control-state-card' }, title),
  };
});

vi.mock('../KanbanBoard', async () => {
  const ReactModule = await import('react');

  return {
    KanbanBoard: ({
      focusTaskRequest,
      repoPath,
      worktreePath,
    }: {
      focusTaskRequest?: TodoTaskFocusRequest | null;
      repoPath: string;
      worktreePath?: string;
    }) =>
      ReactModule.createElement('output', {
        'data-testid': 'kanban-board',
        'data-focus-task-request': JSON.stringify(focusTaskRequest ?? null),
        'data-repo-path': repoPath,
        'data-worktree-path': worktreePath ?? '',
      }),
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

function renderTodoPanel(props: React.ComponentProps<typeof TodoPanel>): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(TodoPanel, props));
  });
  mountedRoots.push(root);

  return container;
}

const mountedRoots: Root[] = [];

describe('TodoPanel', () => {
  afterEach(() => {
    for (const mountedRoot of mountedRoots.splice(0)) {
      act(() => {
        mountedRoot.unmount();
      });
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders the project-only empty state when no repository is selected', () => {
    const container = renderTodoPanel({});

    expect(container.querySelector('[data-testid="control-state-card"]')?.textContent).toBe(
      'No repository selected'
    );
    expect(container.querySelector('[data-testid="kanban-board"]')).toBeNull();
    expect(container.querySelector('button[aria-label="AI Center"]')).toBeNull();
  });

  it('renders the project kanban board without global scope controls', () => {
    const focusTaskRequest: TodoTaskFocusRequest = {
      repoPath: '/repo/current',
      taskId: 'task-ready',
      token: 1,
    };
    const container = renderTodoPanel({
      focusTaskRequest,
      repoPath: '/repo/current',
      worktreePath: '/repo/current',
    });
    const board = container.querySelector<HTMLElement>('[data-testid="kanban-board"]');

    expect(board).not.toBeNull();
    expect(board?.getAttribute('data-repo-path')).toBe('/repo/current');
    expect(board?.getAttribute('data-worktree-path')).toBe('/repo/current');
    expect(board?.getAttribute('data-focus-task-request')).toBe(JSON.stringify(focusTaskRequest));
    expect(container.querySelector('button[aria-label="AI Center"]')).toBeNull();
  });
});
