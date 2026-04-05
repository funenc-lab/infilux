import { beforeEach, describe, expect, it, vi } from 'vitest';

const windowManagerTestDoubles = vi.hoisted(() => {
  const createMainWindow = vi.fn();

  return {
    createMainWindow,
  };
});

vi.mock('../MainWindow', () => ({
  createMainWindow: windowManagerTestDoubles.createMainWindow,
}));

describe('WindowManager', () => {
  beforeEach(() => {
    windowManagerTestDoubles.createMainWindow.mockReset();
    windowManagerTestDoubles.createMainWindow.mockReturnValue({
      id: 101,
    });
  });

  it('opens a local window with a null replacement window by default', async () => {
    const { openLocalWindow } = await import('../WindowManager');

    const win = openLocalWindow();

    expect(windowManagerTestDoubles.createMainWindow).toHaveBeenCalledWith({
      bootstrapMainStage: null,
      replaceWindow: null,
    });
    expect(win).toEqual({ id: 101 });
  });

  it('forwards an explicit replacement window when opening a local window', async () => {
    const replaceWindow = {
      id: 7,
    };

    const { openLocalWindow } = await import('../WindowManager');

    openLocalWindow({ replaceWindow: replaceWindow as never });

    expect(windowManagerTestDoubles.createMainWindow).toHaveBeenCalledWith({
      bootstrapMainStage: null,
      replaceWindow,
    });
  });
});
