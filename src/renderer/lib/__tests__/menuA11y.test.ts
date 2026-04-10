import type { KeyboardEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusFirstMenuItem, handleMenuNavigationKeyDown } from '../menuA11y';

function createMenu(itemsCount: number) {
  const items = Array.from({ length: itemsCount }, () => ({
    focus: vi.fn(),
  })) as unknown as HTMLElement[];
  const querySelectorAll = vi.fn(() => items);
  const container = { querySelectorAll } as unknown as HTMLElement;

  return { container, items, querySelectorAll };
}

function createKeyEvent(
  key: string,
  container: HTMLElement
): KeyboardEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn> } {
  const preventDefault = vi.fn();
  return {
    key,
    currentTarget: container,
    preventDefault,
  } as unknown as KeyboardEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn> };
}

describe('menuA11y', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('focuses the first enabled menu item', () => {
    const { container, items, querySelectorAll } = createMenu(3);

    focusFirstMenuItem(container);

    expect(querySelectorAll).toHaveBeenCalledWith('[role="menuitem"]:not(:disabled)');
    expect(items[0]?.focus).toHaveBeenCalledTimes(1);
    expect(items[1]?.focus).not.toHaveBeenCalled();
  });

  it('closes the menu on Escape even when no items are available', () => {
    const { container } = createMenu(0);
    const event = createKeyEvent('Escape', container);
    const onClose = vi.fn();

    handleMenuNavigationKeyDown(event, onClose);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the next item and wraps from the end', () => {
    const { container, items } = createMenu(3);
    vi.stubGlobal('document', { activeElement: items[2] });
    const event = createKeyEvent('ArrowDown', container);

    handleMenuNavigationKeyDown(event, vi.fn());

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(items[0]?.focus).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the first item when ArrowUp starts without an active item', () => {
    const { container, items } = createMenu(3);
    vi.stubGlobal('document', { activeElement: null });
    const event = createKeyEvent('ArrowUp', container);

    handleMenuNavigationKeyDown(event, vi.fn());

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(items[0]?.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses the first item on Home', () => {
    const { container, items } = createMenu(3);
    vi.stubGlobal('document', { activeElement: items[1] });
    const event = createKeyEvent('Home', container);

    handleMenuNavigationKeyDown(event, vi.fn());

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(items[0]?.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses the last item on End', () => {
    const { container, items } = createMenu(3);
    vi.stubGlobal('document', { activeElement: items[0] });
    const event = createKeyEvent('End', container);

    handleMenuNavigationKeyDown(event, vi.fn());

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(items[2]?.focus).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated keys without changing focus or closing the menu', () => {
    const { container, items } = createMenu(2);
    vi.stubGlobal('document', { activeElement: items[0] });
    const event = createKeyEvent('Enter', container);
    const onClose = vi.fn();

    handleMenuNavigationKeyDown(event, onClose);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(items[0]?.focus).not.toHaveBeenCalled();
    expect(items[1]?.focus).not.toHaveBeenCalled();
  });
});
