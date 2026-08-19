/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryLoadMoreButton } from '../RepositoryLoadMoreButton';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('lucide-react', () => ({
  ChevronDown: (props: Record<string, unknown>) => React.createElement('svg', props),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, variables?: Record<string, string | number>) =>
      value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(variables?.[key] ?? '')),
  }),
}));

describe('RepositoryLoadMoreButton', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes the next batch and remaining count as a keyboard-capable button', async () => {
    const onShowMore = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(RepositoryLoadMoreButton, {
          hiddenCount: 12,
          nextBatchSize: 8,
          onShowMore,
        })
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show 8 more projects"]'
    );
    expect(button?.textContent).toContain('Show 8 more');
    expect(button?.textContent).toContain('12 remaining');

    await act(async () => {
      button?.click();
    });
    expect(onShowMore).toHaveBeenCalledOnce();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders nothing when every project is visible', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(RepositoryLoadMoreButton, {
          hiddenCount: 0,
          nextBatchSize: 0,
          onShowMore: vi.fn(),
        })
      );
    });

    expect(container.querySelector('button')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
