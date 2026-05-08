import { describe, expect, it, vi } from 'vitest';
import { openDetachedDevTools, toggleDetachedDevTools } from '../devtools';

function createWebContents(isOpen = false) {
  return {
    closeDevTools: vi.fn(),
    isDevToolsOpened: vi.fn(() => isOpen),
    openDevTools: vi.fn(),
  };
}

describe('devtools helpers', () => {
  it('opens DevTools detached so the app viewport is not squeezed by a docked panel', () => {
    const webContents = createWebContents();

    openDetachedDevTools(webContents);

    expect(webContents.openDevTools).toHaveBeenCalledWith({ mode: 'detach' });
  });

  it('toggles DevTools without falling back to docked mode', () => {
    const closedWebContents = createWebContents(false);
    toggleDetachedDevTools(closedWebContents);

    expect(closedWebContents.openDevTools).toHaveBeenCalledWith({ mode: 'detach' });
    expect(closedWebContents.closeDevTools).not.toHaveBeenCalled();

    const openWebContents = createWebContents(true);
    toggleDetachedDevTools(openWebContents);

    expect(openWebContents.closeDevTools).toHaveBeenCalledTimes(1);
    expect(openWebContents.openDevTools).not.toHaveBeenCalled();
  });
});
