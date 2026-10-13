/* @vitest-environment jsdom */

import React, { act, useState } from 'react';
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

  it('exposes an icon-only keyboard fallback without visible loading text', async () => {
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
      'button[aria-label="Load more projects"]'
    );
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('');
    expect(button?.querySelector('svg')).not.toBeNull();

    await act(async () => {
      button?.click();
    });
    expect(onShowMore).toHaveBeenCalledOnce();

    await act(async () => {
      root.unmount();
    });
  });

  it('loads one batch after the user scrolls down near the container bottom', async () => {
    const onShowMore = vi.fn();
    const scrollContainer = document.createElement('div');
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
    document.body.appendChild(scrollContainer);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(RepositoryLoadMoreButton, {
          hiddenCount: 12,
          nextBatchSize: 8,
          onShowMore,
          scrollContainer,
        })
      );
    });
    const button = container.querySelector('button')!;
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 90, 200, 32));

    scrollContainer.scrollTop = 190;
    await act(async () => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });
    expect(onShowMore).toHaveBeenCalledOnce();

    await act(async () => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });
    expect(onShowMore).toHaveBeenCalledOnce();

    await act(async () => {
      root.unmount();
    });
  });

  it('only loads the group whose loading control is visible in the scroll viewport', async () => {
    const scrollContainer = document.createElement('div');
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
    document.body.appendChild(scrollContainer);
    const root = createRoot(scrollContainer);
    const onFirstGroupShowMore = vi.fn();
    const onSecondGroupShowMore = vi.fn();

    try {
      await act(async () => {
        root.render(
          React.createElement(
            React.Fragment,
            null,
            React.createElement(RepositoryLoadMoreButton, {
              hiddenCount: 12,
              nextBatchSize: 8,
              onShowMore: onFirstGroupShowMore,
              scrollContainer,
            }),
            React.createElement(RepositoryLoadMoreButton, {
              hiddenCount: 12,
              nextBatchSize: 8,
              onShowMore: onSecondGroupShowMore,
              scrollContainer,
            })
          )
        );
      });
      const buttons = scrollContainer.querySelectorAll('button');
      vi.spyOn(buttons[0], 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -100, 200, 32));
      vi.spyOn(buttons[1], 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 90, 200, 32));

      scrollContainer.scrollTop = 190;
      await act(async () => scrollContainer.dispatchEvent(new Event('scroll')));

      expect(onFirstGroupShowMore).not.toHaveBeenCalled();
      expect(onSecondGroupShowMore).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it.each([
    4, 0,
  ])('restores the scroll offset after loading a batch with %i remaining', async (remaining) => {
    const scrollContainer = document.createElement('div');
    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 170,
    });
    document.body.appendChild(scrollContainer);
    const root = createRoot(scrollContainer);

    function Harness() {
      const [hiddenCount, setHiddenCount] = useState(12);
      return React.createElement(RepositoryLoadMoreButton, {
        hiddenCount,
        nextBatchSize: Math.min(8, hiddenCount),
        scrollContainer,
        onShowMore: () => {
          scrollContainer.scrollTop = 250;
          setHiddenCount(remaining);
        },
      });
    }

    try {
      await act(async () => root.render(React.createElement(Harness)));
      await act(async () => scrollContainer.querySelector('button')!.click());

      expect(scrollContainer.scrollTop).toBe(170);
      expect(scrollContainer.querySelector('button') === null).toBe(remaining === 0);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('keeps a visible directory anchored when loading inserts rows in an earlier group', async () => {
    const scrollContainer = document.createElement('div');
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 280 },
      scrollTop: { configurable: true, writable: true, value: 130 },
    });
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 280));
    document.body.appendChild(scrollContainer);
    const root = createRoot(scrollContainer);
    let insertedHeight = 0;

    function Harness() {
      const [hiddenCount, setHiddenCount] = useState(12);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: 'control-tree-node', 'data-active': 'repo' }),
        React.createElement(RepositoryLoadMoreButton, {
          hiddenCount,
          nextBatchSize: Math.min(8, hiddenCount),
          scrollContainer,
          onShowMore: () => {
            insertedHeight = 336;
            setHiddenCount(4);
          },
        })
      );
    }

    try {
      await act(async () => root.render(React.createElement(Harness)));
      const selectedRow = scrollContainer.querySelector<HTMLElement>('.control-tree-node')!;
      vi.spyOn(selectedRow, 'getBoundingClientRect').mockImplementation(
        () => new DOMRect(0, 336 + insertedHeight - scrollContainer.scrollTop, 200, 42)
      );
      const previousOffset = selectedRow.getBoundingClientRect().top;

      await act(async () => scrollContainer.querySelector('button')!.click());

      expect(selectedRow.getBoundingClientRect().top).toBe(previousOffset);
      expect(scrollContainer.scrollTop).toBe(466);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('loads another batch on renewed downward wheel input while anchored at the bottom', async () => {
    const scrollContainer = document.createElement('div');
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 200 },
    });
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
    document.body.appendChild(scrollContainer);
    const root = createRoot(scrollContainer);
    const onShowMore = vi.fn();

    function Harness() {
      const [hiddenCount, setHiddenCount] = useState(20);
      return React.createElement(RepositoryLoadMoreButton, {
        hiddenCount,
        nextBatchSize: Math.min(8, hiddenCount),
        scrollContainer,
        onShowMore: () => {
          onShowMore();
          setHiddenCount((count) => count - 8);
        },
      });
    }

    try {
      await act(async () => root.render(React.createElement(Harness)));
      vi.spyOn(scrollContainer.querySelector('button')!, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 90, 200, 32)
      );

      await act(async () => {
        scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      });
      expect(onShowMore).toHaveBeenCalledTimes(1);

      await act(async () => scrollContainer.dispatchEvent(new Event('scroll')));
      await act(async () => {
        scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
      });
      expect(onShowMore).toHaveBeenCalledTimes(1);

      await act(async () => {
        scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      });
      expect(onShowMore).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('renders nothing when every project is visible', async () => {
    const onShowMore = vi.fn();
    const scrollContainer = document.createElement('div');
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    document.body.appendChild(scrollContainer);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(RepositoryLoadMoreButton, {
          hiddenCount: 0,
          nextBatchSize: 0,
          onShowMore,
          scrollContainer,
        })
      );
    });

    expect(container.querySelector('button')).toBeNull();

    scrollContainer.scrollTop = 190;
    await act(async () => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });
    expect(onShowMore).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
