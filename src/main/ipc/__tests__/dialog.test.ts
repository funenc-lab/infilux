import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

type MenuItemConfig = {
  label?: string;
  type?: 'normal' | 'separator';
  enabled?: boolean;
  click?: () => void;
};

const dialogTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const fromWebContents = vi.fn();
  const getFocusedWindow = vi.fn();
  const getAllWindows = vi.fn();
  const showOpenDialog = vi.fn();
  const getCurrentLocale = vi.fn();
  const translate = vi.fn();

  const appendedItems: MenuItemConfig[] = [];
  let popupCallback: (() => void) | undefined;

  const Menu = vi.fn(function (this: {
    append: (item: MenuItemConfig) => void;
    popup: (options: { window?: unknown; callback?: () => void }) => void;
  }) {
    this.append = vi.fn((item: MenuItemConfig) => {
      appendedItems.push(item);
    });
    this.popup = vi.fn((options: { window?: unknown; callback?: () => void }) => {
      popupCallback = options.callback;
    });
  });

  const MenuItem = vi.fn(function (this: MenuItemConfig, config: MenuItemConfig) {
    Object.assign(this, config);
  });

  function reset() {
    handlers.clear();
    appendedItems.length = 0;
    popupCallback = undefined;

    fromWebContents.mockReset();
    getFocusedWindow.mockReset();
    getAllWindows.mockReset();
    showOpenDialog.mockReset();
    getCurrentLocale.mockReset();
    translate.mockReset();
    Menu.mockClear();
    MenuItem.mockClear();

    const fallbackWindow = { id: 'window-1' };
    fromWebContents.mockReturnValue(fallbackWindow);
    getFocusedWindow.mockReturnValue({ id: 'focused-window' });
    getAllWindows.mockReturnValue([{ id: 'all-window' }]);
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/selected'] });
    getCurrentLocale.mockReturnValue('en');
    translate.mockImplementation((_locale: string, key: string) => `translated:${key}`);
  }

  return {
    handlers,
    fromWebContents,
    getFocusedWindow,
    getAllWindows,
    showOpenDialog,
    getCurrentLocale,
    translate,
    Menu,
    MenuItem,
    appendedItems,
    getPopupCallback: () => popupCallback,
    reset,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: dialogTestDoubles.fromWebContents,
    getFocusedWindow: dialogTestDoubles.getFocusedWindow,
    getAllWindows: dialogTestDoubles.getAllWindows,
  },
  dialog: {
    showOpenDialog: dialogTestDoubles.showOpenDialog,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      dialogTestDoubles.handlers.set(channel, handler);
    }),
  },
  Menu: dialogTestDoubles.Menu,
  MenuItem: dialogTestDoubles.MenuItem,
}));

vi.mock('@shared/i18n', () => ({
  translate: dialogTestDoubles.translate,
}));

vi.mock('../../services/i18n', () => ({
  getCurrentLocale: dialogTestDoubles.getCurrentLocale,
}));

function getHandler(channel: string) {
  const handler = dialogTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('dialog IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dialogTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens directories and files using the resolved window and returns null on cancel', async () => {
    const { registerDialogHandlers } = await import('../dialog');
    registerDialogHandlers();

    const event = { sender: { id: 1 } };

    expect(await getHandler(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY)(event)).toBe('/tmp/selected');
    expect(dialogTestDoubles.showOpenDialog).toHaveBeenNthCalledWith(
      1,
      { id: 'window-1' },
      {
        properties: ['openDirectory', 'createDirectory'],
        title: 'translated:Select folder',
      }
    );

    dialogTestDoubles.fromWebContents.mockReturnValueOnce(null);
    dialogTestDoubles.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/tmp/file.ts'],
    });
    expect(
      await getHandler(IPC_CHANNELS.DIALOG_OPEN_FILE)(event, {
        filters: [{ name: 'TypeScript', extensions: ['ts'] }],
        showHiddenFiles: true,
      })
    ).toBe('/tmp/file.ts');
    expect(dialogTestDoubles.showOpenDialog).toHaveBeenNthCalledWith(
      2,
      { id: 'focused-window' },
      {
        properties: ['openFile', 'showHiddenFiles'],
        title: 'translated:Select file',
        filters: [{ name: 'TypeScript', extensions: ['ts'] }],
      }
    );

    dialogTestDoubles.fromWebContents.mockReturnValueOnce(null);
    dialogTestDoubles.getFocusedWindow.mockReturnValueOnce(null);
    dialogTestDoubles.showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    expect(await getHandler(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY)(event)).toBeNull();
    expect(dialogTestDoubles.showOpenDialog).toHaveBeenNthCalledWith(
      3,
      { id: 'all-window' },
      {
        properties: ['openDirectory', 'createDirectory'],
        title: 'translated:Select folder',
      }
    );
  });

  it('builds a context menu, resolves the clicked item and falls back to null on popup close', async () => {
    const { registerDialogHandlers } = await import('../dialog');
    registerDialogHandlers();

    const event = { sender: { id: 1 } };

    const clickPromise = getHandler(IPC_CHANNELS.CONTEXT_MENU_SHOW)(event, [
      { label: 'Open', id: 'open' },
      { type: 'separator', id: 'sep' },
      { label: 'Delete', id: 'delete', disabled: true },
    ]);

    expect(dialogTestDoubles.appendedItems).toHaveLength(3);
    expect(dialogTestDoubles.appendedItems[0]).toEqual(
      expect.objectContaining({
        label: 'Open',
        enabled: true,
      })
    );
    expect(dialogTestDoubles.appendedItems[1]).toEqual(
      expect.objectContaining({
        type: 'separator',
      })
    );
    expect(dialogTestDoubles.appendedItems[2]).toEqual(
      expect.objectContaining({
        label: 'Delete',
        enabled: false,
      })
    );

    dialogTestDoubles.appendedItems[0]?.click?.();
    await expect(clickPromise).resolves.toBe('open');

    const closePromise = getHandler(IPC_CHANNELS.CONTEXT_MENU_SHOW)(event, [
      { label: 'Rename', id: 'rename' },
    ]);
    dialogTestDoubles.getPopupCallback()?.();
    await expect(closePromise).resolves.toBeNull();
  });
});
