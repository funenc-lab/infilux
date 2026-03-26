import { REPOSITORY_URL } from '@shared/branding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MenuItem = {
  accelerator?: string;
  click?: () => void;
  label?: string;
  role?: string;
  submenu?: MenuItem[];
  type?: 'separator';
};

const menuBuilderTestDoubles = vi.hoisted(() => {
  let isPackaged = false;
  let focusedWindow: ReturnType<typeof createWindow> | null = null;
  let allWindows: ReturnType<typeof createWindow>[] = [];

  const translate = vi.fn((locale: string, key: string) => `${locale}:${key}`);
  const getCurrentLocale = vi.fn(() => 'zh');
  const buildFromTemplate = vi.fn((template: MenuItem[]) => ({ template }));
  const openExternal = vi.fn();

  function createWindow() {
    let zoomLevel = 1;
    return {
      webContents: {
        send: vi.fn(),
        toggleDevTools: vi.fn(),
        getZoomLevel: vi.fn(() => zoomLevel),
        setZoomLevel: vi.fn((value: number) => {
          zoomLevel = value;
        }),
      },
    };
  }

  function reset() {
    isPackaged = false;
    focusedWindow = null;
    allWindows = [];
    translate.mockReset();
    getCurrentLocale.mockReset();
    buildFromTemplate.mockReset();
    openExternal.mockReset();

    translate.mockImplementation((locale: string, key: string) => `${locale}:${key}`);
    getCurrentLocale.mockReturnValue('zh');
    buildFromTemplate.mockImplementation((template: MenuItem[]) => ({ template }));
  }

  function setWindows(
    nextWindows: ReturnType<typeof createWindow>[],
    nextFocused?: ReturnType<typeof createWindow> | null
  ) {
    allWindows = nextWindows;
    focusedWindow = nextFocused ?? nextWindows[0] ?? null;
  }

  return {
    get appState() {
      return { isPackaged };
    },
    setPackaged(value: boolean) {
      isPackaged = value;
    },
    BrowserWindow: {
      getFocusedWindow: vi.fn(() => focusedWindow),
      getAllWindows: vi.fn(() => allWindows),
    },
    Menu: {
      buildFromTemplate,
    },
    app: {
      get name() {
        return 'Infilux';
      },
      get isPackaged() {
        return isPackaged;
      },
    },
    shell: {
      openExternal,
    },
    translate,
    getCurrentLocale,
    buildFromTemplate,
    openExternal,
    createWindow,
    setWindows,
    reset,
  };
});

vi.mock('@shared/i18n', async () => {
  const actual = await vi.importActual<typeof import('@shared/i18n')>('@shared/i18n');
  return {
    ...actual,
    translate: menuBuilderTestDoubles.translate,
  };
});

vi.mock('electron', () => ({
  app: menuBuilderTestDoubles.app,
  BrowserWindow: menuBuilderTestDoubles.BrowserWindow,
  Menu: menuBuilderTestDoubles.Menu,
  shell: menuBuilderTestDoubles.shell,
}));

vi.mock('../i18n', () => ({
  getCurrentLocale: menuBuilderTestDoubles.getCurrentLocale,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

function getTemplate(): MenuItem[] {
  const template = menuBuilderTestDoubles.buildFromTemplate.mock.calls.at(-1)?.[0];
  if (!template) {
    throw new Error('Missing menu template');
  }
  return template as MenuItem[];
}

function findMenu(template: MenuItem[], label: string): MenuItem {
  const item = template.find((entry) => entry.label === label);
  if (!item) {
    throw new Error(`Missing menu item: ${label}`);
  }
  return item;
}

function findSubmenuItem(menu: MenuItem, label: string): MenuItem {
  const item = menu.submenu?.find((entry) => entry.label === label);
  if (!item) {
    throw new Error(`Missing submenu item: ${label}`);
  }
  return item;
}

describe('MenuBuilder', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    menuBuilderTestDoubles.reset();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('builds the Windows development menu and wires actions to the active window', async () => {
    setPlatform('win32');
    menuBuilderTestDoubles.setPackaged(false);
    const activeWindow = menuBuilderTestDoubles.createWindow();
    const onNewWindow = vi.fn();
    menuBuilderTestDoubles.setWindows([activeWindow]);

    const { buildAppMenu } = await import('../MenuBuilder');
    buildAppMenu({ onNewWindow });

    const template = getTemplate();
    expect(template[0]?.label).toBe('zh:File');
    expect(menuBuilderTestDoubles.translate).toHaveBeenCalledWith('zh', 'File');

    const fileMenu = findMenu(template, 'zh:File');
    const viewMenu = findMenu(template, 'zh:View');
    const helpMenu = findMenu(template, 'zh:Help');

    findSubmenuItem(fileMenu, 'zh:New Window').click?.();
    findSubmenuItem(fileMenu, 'zh:Settings...').click?.();
    findSubmenuItem(viewMenu, 'zh:Action Panel').click?.();
    findSubmenuItem(viewMenu, 'zh:Developer Tools').click?.();
    findSubmenuItem(viewMenu, 'zh:Reset Zoom').click?.();
    findSubmenuItem(viewMenu, 'zh:Zoom In').click?.();
    findSubmenuItem(viewMenu, 'zh:Zoom Out').click?.();
    findSubmenuItem(helpMenu, 'zh:Learn More').click?.();

    expect(onNewWindow).toHaveBeenCalledTimes(1);
    expect(activeWindow.webContents.send).toHaveBeenCalledWith('menu-action', 'open-settings');
    expect(activeWindow.webContents.send).toHaveBeenCalledWith('menu-action', 'open-action-panel');
    expect(activeWindow.webContents.toggleDevTools).toHaveBeenCalledTimes(1);
    expect(activeWindow.webContents.setZoomLevel).toHaveBeenNthCalledWith(1, 0);
    expect(activeWindow.webContents.setZoomLevel).toHaveBeenNthCalledWith(2, 0.5);
    expect(activeWindow.webContents.setZoomLevel).toHaveBeenNthCalledWith(3, 0);
    expect(menuBuilderTestDoubles.openExternal).toHaveBeenCalledWith(REPOSITORY_URL);
    expect(viewMenu.submenu?.some((item) => item.role === 'reload')).toBe(true);
    expect(viewMenu.submenu?.some((item) => item.role === 'forceReload')).toBe(true);
    expect(fileMenu.submenu?.some((item) => item.role === 'quit')).toBe(true);
  });

  it('builds the macOS packaged menu and falls back to the first window', async () => {
    setPlatform('darwin');
    menuBuilderTestDoubles.setPackaged(true);
    const fallbackWindow = menuBuilderTestDoubles.createWindow();
    menuBuilderTestDoubles.setWindows([fallbackWindow], null);

    const { buildAppMenu } = await import('../MenuBuilder');
    buildAppMenu();

    const template = getTemplate();
    expect(template[0]?.label).toBe('Infilux');

    const appMenu = template[0];
    const fileMenu = findMenu(template, 'zh:File');
    const viewMenu = findMenu(template, 'zh:View');

    findSubmenuItem(appMenu, 'zh:Settings...').click?.();

    expect(fallbackWindow.webContents.send).toHaveBeenCalledWith('menu-action', 'open-settings');
    expect(fileMenu.submenu?.some((item) => item.label === 'zh:Settings...')).toBe(false);
    expect(viewMenu.submenu?.some((item) => item.role === 'reload')).toBe(false);
    expect(viewMenu.submenu?.some((item) => item.role === 'forceReload')).toBe(false);
  });
});
