import type { TempWorkspaceItem } from '@shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('lucide-react', () => ({
  GitBranch: () => React.createElement('svg'),
}));

vi.mock('@/components/temp-workspace/TempWorkspaceContextMenu', () => ({
  TempWorkspaceContextMenu: () => null,
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (value: string) => value }),
}));

vi.mock('@/stores/worktreeActivity', () => ({
  useWorktreeActivityStore: (
    selector: (state: { activities: Record<string, unknown> }) => unknown
  ) => selector({ activities: {} }),
}));

import { TempWorkspaceTreeItem } from '../TempWorkspaceTreeItem';

describe('TempWorkspaceTreeItem', () => {
  it('keeps temporary session paths out of the compact tree row', () => {
    const item: TempWorkspaceItem = {
      id: 'temp-1',
      title: 'Review queue',
      folderName: 'review-queue',
      path: '/Users/example/.infilux/temporary/review-queue',
      createdAt: 1,
    };

    const markup = renderToStaticMarkup(
      React.createElement(TempWorkspaceTreeItem, {
        item,
        isActive: false,
        onSelect: vi.fn(),
        onRequestRename: vi.fn(),
        onRequestDelete: vi.fn(),
      })
    );

    expect(markup).toContain('Review queue');
    expect(markup).not.toContain('/Users/example/.infilux/temporary/review-queue');
  });
});
