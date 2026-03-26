import { Buffer } from 'node:buffer';
import { translate } from '@shared/i18n';
import { app, Menu, nativeImage, Tray } from 'electron';
import { getCurrentLocale } from './i18n';

const TRAY_ICON_SVG = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="176" cy="256" r="138" fill="#000000" />
  <circle cx="176" cy="256" r="70" fill="#FFFFFF" />
  <circle cx="336" cy="256" r="138" fill="#000000" />
  <circle cx="336" cy="256" r="70" fill="#FFFFFF" />
  <circle cx="176" cy="256" r="22" fill="#000000" />
  <circle cx="336" cy="256" r="22" fill="#000000" />
</svg>
`.trim();

interface TrayServiceOptions {
  onOpen: () => void;
  onQuit: () => void;
  statusLabel?: string;
}

function createTrayIcon() {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(TRAY_ICON_SVG).toString('base64')}`;
  const icon = nativeImage.createFromDataURL(dataUrl);

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  return icon;
}

function t(key: string): string {
  return translate(getCurrentLocale(), key);
}

class TrayService {
  private tray: Tray | null = null;
  private options: TrayServiceOptions | null = null;

  init(options: TrayServiceOptions): void {
    const appName = app.getName();
    this.options = {
      ...options,
      statusLabel: options.statusLabel ?? appName,
    };

    if (this.tray) {
      this.refreshMenu();
      return;
    }

    this.tray = new Tray(createTrayIcon());
    this.tray.setToolTip(appName);
    this.tray.on('click', () => {
      this.options?.onOpen();
    });

    this.refreshMenu();
  }

  refreshMenu(): void {
    if (!this.tray || !this.options) {
      return;
    }

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          enabled: false,
          label: this.options.statusLabel ?? app.getName(),
        },
        { type: 'separator' },
        {
          label: t('Open'),
          click: () => {
            this.options?.onOpen();
          },
        },
        { type: 'separator' },
        {
          label: t('Exit'),
          click: () => {
            this.options?.onQuit();
          },
        },
      ])
    );
  }

  isInitialized(): boolean {
    return this.tray !== null;
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
    this.options = null;
  }
}

export const appTrayService = new TrayService();
