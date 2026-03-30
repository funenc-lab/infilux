import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('lucide-react', () => ({
  FileCode: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/empty', () => ({
  Empty: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyDescription: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyMedia: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  EmptyTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('../EditorArea', () => ({
  EditorArea: ({ activeTabPath }: { activeTabPath: string | null }) =>
    React.createElement('div', {
      'data-testid': 'editor-area',
      'data-editor-area': activeTabPath ?? 'none',
    }),
}));

describe('DeferredEditorArea', () => {
  it('renders the editor immediately when shouldLoad is true', async () => {
    const { DeferredEditorArea } = await import('../DeferredEditorArea');
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(DeferredEditorArea, {
          shouldLoad: true,
          tabs: [],
          activeTab: null,
          activeTabPath: '/repo/src/App.tsx',
          pendingCursor: null,
          onTabClick: vi.fn(),
          onTabClose: vi.fn(),
          onTabReorder: vi.fn(),
          onContentChange: vi.fn(),
          onViewStateChange: vi.fn(),
          onSave: vi.fn(),
          onClearPendingCursor: vi.fn(),
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const editor = container.querySelector('[data-testid="editor-area"]');
    expect(editor).not.toBeNull();
    expect(editor?.getAttribute('data-editor-area')).toBe('/repo/src/App.tsx');
    expect(container.textContent).not.toContain('Loading editor');

    await act(async () => {
      root.unmount();
    });
  });
});
