import { Buffer } from 'node:buffer';
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
  let createdTray: {
    destroy: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    setContextMenu: ReturnType<typeof vi.fn>;
    setToolTip: ReturnType<typeof vi.fn>;
  } | null = null;

  const createFromDataURL = vi.fn(() => ({
    setTemplateImage: vi.fn(),
  }));
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
    createFromDataURL.mockClear();
    buildFromTemplate.mockClear();
    getName.mockClear();
    translate.mockClear();
    getCurrentLocale.mockClear();
    Tray.mockClear();
    getName.mockReturnValue('Infilux');
    translate.mockImplementation((locale: string, key: string) => `${locale}:${key}`);
    getCurrentLocale.mockReturnValue('zh');
  }

  return {
    Tray,
    app: {
      getName,
    },
    nativeImage: {
      createFromDataURL,
    },
    Menu: {
      buildFromTemplate,
    },
    translate,
    getCurrentLocale,
    emitTray,
    getLastTemplate,
    getCreatedTray: () => createdTray,
    getLastNativeImage: () => createFromDataURL.mock.results.at(-1)?.value,
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
    expect(trayServiceTestDoubles.getLastNativeImage()?.setTemplateImage).toHaveBeenCalledWith(
      true
    );
    const [dataUrl] = (trayServiceTestDoubles.nativeImage.createFromDataURL.mock.calls[0] ??
      []) as [string?];
    expect(dataUrl).toContain('data:image/svg+xml;base64,');
    const svg = Buffer.from(dataUrl?.split(',')[1] ?? '', 'base64').toString('utf8');
    expect(svg).toContain('transform="translate(28 62) scale(0.34)"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).not.toContain('<circle');

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
