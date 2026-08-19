import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TrayListener = () => void;
type TrayMenuItem = {
  click?: () => void;
  enabled?: boolean;
  label?: string;
  type?: 'separator';
};

const trayServiceTestDoubles = vi.hoisted(() => {
  const listeners = new Map<string, TrayListener>();
  let isPackaged = false;
  let createdTray: {
    destroy: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    setContextMenu: ReturnType<typeof vi.fn>;
    setToolTip: ReturnType<typeof vi.fn>;
  } | null = null;

  const createNativeImage = (isEmpty = false) => ({
    isEmpty: vi.fn(() => isEmpty),
    setTemplateImage: vi.fn(),
  });
  const createFromDataURL = vi.fn(() => createNativeImage());
  const createFromPath = vi.fn(() => createNativeImage());
  const buildFromTemplate = vi.fn((template: TrayMenuItem[]) => ({ template }));
  const getName = vi.fn(() => 'Infilux');
  const translate = vi.fn((locale: string, key: string) => `${locale}:${key}`);
  const getCurrentLocale = vi.fn(() => 'zh');

  const Tray = vi.fn(() => {
    listeners.clear();
    createdTray = {
      destroy: vi.fn(),
      on: vi.fn((event: string, listener: TrayListener) => {
        listeners.set(event, listener);
      }),
      setContextMenu: vi.fn(),
      setToolTip: vi.fn(),
    };
    return createdTray;
  });

  function emitTray(event: string) {
    const listener = listeners.get(event);
    if (!listener) {
      throw new Error(`Missing tray listener: ${event}`);
    }
    listener();
  }

  function getLastTemplate(): TrayMenuItem[] {
    const template = buildFromTemplate.mock.calls.at(-1)?.[0];
    if (!template) {
      throw new Error('Missing tray menu template');
    }
    return template as TrayMenuItem[];
  }

  function reset() {
    listeners.clear();
    createdTray = null;
    isPackaged = false;
    createFromDataURL.mockClear();
    createFromPath.mockClear();
    buildFromTemplate.mockClear();
    getName.mockClear();
    translate.mockClear();
    getCurrentLocale.mockClear();
    Tray.mockClear();
    createFromPath.mockImplementation(() => createNativeImage());
    getName.mockReturnValue('Infilux');
    translate.mockImplementation((locale: string, key: string) => `${locale}:${key}`);
    getCurrentLocale.mockReturnValue('zh');
  }

  return {
    Tray,
    app: {
      getName,
      getAppPath: vi.fn(() => '/mock/app'),
      get isPackaged() {
        return isPackaged;
      },
    },
    nativeImage: {
      createFromDataURL,
      createFromPath,
    },
    Menu: {
      buildFromTemplate,
    },
    translate,
    getCurrentLocale,
    emitTray,
    getLastTemplate,
    getCreatedTray: () => createdTray,
    getLastNativeImage: () =>
      createFromDataURL.mock.results.at(-1)?.value ?? createFromPath.mock.results.at(-1)?.value,
    setPackaged: (value: boolean) => {
      isPackaged = value;
    },
    reset,
  };
});

vi.mock('electron', () => ({
  Tray: trayServiceTestDoubles.Tray,
  app: trayServiceTestDoubles.app,
  nativeImage: trayServiceTestDoubles.nativeImage,
  Menu: trayServiceTestDoubles.Menu,
}));

vi.mock('@shared/i18n', async () => {
  const actual = await vi.importActual<typeof import('@shared/i18n')>('@shared/i18n');
  return {
    ...actual,
    translate: trayServiceTestDoubles.translate,
  };
});

vi.mock('../i18n', () => ({
  getCurrentLocale: trayServiceTestDoubles.getCurrentLocale,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalResourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

describe('TrayService', () => {
  beforeEach(() => {
    vi.resetModules();
    trayServiceTestDoubles.reset();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalResourcesPathDescriptor) {
      Object.defineProperty(process, 'resourcesPath', originalResourcesPathDescriptor);
    } else {
      Reflect.deleteProperty(process, 'resourcesPath');
    }
    vi.restoreAllMocks();
  });

  it('creates a macOS tray with a template icon and localized menu actions', async () => {
    setPlatform('darwin');
    const onOpen = vi.fn();
    const onQuit = vi.fn();

    const { appTrayService } = await import('../TrayService');
    appTrayService.init({ onOpen, onQuit });

    expect(trayServiceTestDoubles.Tray).toHaveBeenCalledTimes(1);
    expect(trayServiceTestDoubles.app.getName).toHaveBeenCalledTimes(1);
    expect(trayServiceTestDoubles.translate).toHaveBeenCalledWith('zh', 'Open');
    expect(trayServiceTestDoubles.translate).toHaveBeenCalledWith('zh', 'Exit');
    expect(trayServiceTestDoubles.nativeImage.createFromPath).toHaveBeenCalledWith(
      '/mock/app/build/tray/iconTemplate.png'
    );
    expect(trayServiceTestDoubles.nativeImage.createFromDataURL).not.toHaveBeenCalled();
    expect(trayServiceTestDoubles.getLastNativeImage()?.setTemplateImage).toHaveBeenCalledWith(
      true
    );

    const tray = trayServiceTestDoubles.getCreatedTray();
    expect(tray?.setToolTip).toHaveBeenCalledWith('Infilux');
    expect(tray?.setContextMenu).toHaveBeenCalledTimes(1);

    const template = trayServiceTestDoubles.getLastTemplate();
    expect(template[0]).toMatchObject({
      enabled: false,
      label: 'Infilux',
    });

    trayServiceTestDoubles.emitTray('click');
    expect(onOpen).toHaveBeenCalledTimes(1);

    template[2]?.click?.();
    template[4]?.click?.();

    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it('loads the packaged macOS tray icon from the resources directory', async () => {
    setPlatform('darwin');
    trayServiceTestDoubles.setPackaged(true);
    Object.defineProperty(process, 'resourcesPath', {
      value: '/mock/resources',
      configurable: true,
    });

    const { appTrayService } = await import('../TrayService');
    appTrayService.init({ onOpen: vi.fn(), onQuit: vi.fn() });

    expect(trayServiceTestDoubles.nativeImage.createFromPath).toHaveBeenCalledWith(
      '/mock/resources/tray/iconTemplate.png'
    );
  });

  it('uses a visible fallback when the native tray asset cannot be loaded', async () => {
    setPlatform('darwin');
    trayServiceTestDoubles.nativeImage.createFromPath.mockReturnValueOnce({
      isEmpty: vi.fn(() => true),
      setTemplateImage: vi.fn(),
    });

    const { appTrayService } = await import('../TrayService');
    appTrayService.init({ onOpen: vi.fn(), onQuit: vi.fn() });

    expect(trayServiceTestDoubles.nativeImage.createFromPath).toHaveBeenCalledWith(
      '/mock/app/build/tray/iconTemplate.png'
    );
    expect(trayServiceTestDoubles.nativeImage.createFromDataURL).toHaveBeenCalledWith(
      expect.stringContaining('data:image/svg+xml;base64,')
    );
    expect(trayServiceTestDoubles.getLastNativeImage()?.setTemplateImage).toHaveBeenCalledWith(
      true
    );
  });

  it('loads the development tray icon from the application asset', async () => {
    setPlatform('win32');

    const { appTrayService } = await import('../TrayService');
    appTrayService.init({ onOpen: vi.fn(), onQuit: vi.fn() });

    expect(trayServiceTestDoubles.nativeImage.createFromPath).toHaveBeenCalledWith(
      '/mock/app/build/icon.png'
    );
    expect(trayServiceTestDoubles.getLastNativeImage()?.setTemplateImage).not.toHaveBeenCalled();
  });

  it('refreshes and destroys an existing tray instance without recreating it', async () => {
    setPlatform('win32');
    const onOpen = vi.fn();
    const onQuit = vi.fn();

    const { appTrayService } = await import('../TrayService');
    appTrayService.init({ onOpen, onQuit });
    appTrayService.init({ onOpen, onQuit });

    expect(trayServiceTestDoubles.Tray).toHaveBeenCalledTimes(1);

    const tray = trayServiceTestDoubles.getCreatedTray();
    expect(tray?.setContextMenu).toHaveBeenCalledTimes(2);
    expect(trayServiceTestDoubles.getLastNativeImage()?.setTemplateImage).not.toHaveBeenCalled();

    appTrayService.destroy();
    expect(tray?.destroy).toHaveBeenCalledTimes(1);
    expect(appTrayService.isInitialized()).toBe(false);
  });
});
