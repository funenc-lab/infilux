import type { KeyboardEvent } from 'react';

function getMenuItems(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
}

export function focusFirstMenuItem(container: HTMLElement | null): void {
  getMenuItems(container)[0]?.focus();
}

export function handleMenuNavigationKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onClose: () => void
): void {
  const container = event.currentTarget;
  const items = getMenuItems(container);

  if (items.length === 0) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    return;
  }

  const currentIndex = items.indexOf(document.activeElement as HTMLElement);

  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      onClose();
      return;
    case 'ArrowDown': {
      event.preventDefault();
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % items.length : 0;
      items[nextIndex]?.focus();
      return;
    }
    case 'ArrowUp': {
      event.preventDefault();
      const nextIndex = currentIndex >= 0 ? (currentIndex - 1 + items.length) % items.length : 0;
      items[nextIndex]?.focus();
      return;
    }
    case 'Home':
      event.preventDefault();
      items[0]?.focus();
      return;
    case 'End':
      event.preventDefault();
      items[items.length - 1]?.focus();
      return;
    default:
      return;
  }
}
