import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
  it('renders a loading placeholder before the editor module resolves', async () => {
    const { DeferredEditorArea } = await import('../DeferredEditorArea');

    const markup = renderToStaticMarkup(
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

    expect(markup).toContain('Loading editor');
    expect(markup).not.toContain('data-editor-area');
  });
});
