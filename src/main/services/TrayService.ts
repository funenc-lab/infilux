import { Buffer } from 'node:buffer';
import { translate } from '@shared/i18n';
import { app, Menu, nativeImage, Tray } from 'electron';
import { getCurrentLocale } from './i18n';

const TRAY_ICON_SVG = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    transform="translate(28 62) scale(0.34)"
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M183.333 512C183.333 363.852 294.801 260.889 435.556 260.889C495.333 260.889 547.111 282.815 592.889 329.333C638.667 282.815 690.444 260.889 750.222 260.889C890.977 260.889 1002.44 363.852 1002.44 512C1002.44 660.148 890.977 763.111 750.222 763.111C690.444 763.111 638.667 741.185 592.889 694.667C547.111 741.185 495.333 763.111 435.556 763.111C294.801 763.111 183.333 660.148 183.333 512ZM435.556 616C511.462 616 561.047 564.673 592.889 525.11C624.73 564.673 674.316 616 750.222 616C805.824 616 855.778 575.212 855.778 512C855.778 448.788 805.824 408 750.222 408C674.316 408 624.73 459.327 592.889 498.89C561.047 459.327 511.462 408 435.556 408C379.954 408 330 448.788 330 512C330 575.212 379.954 616 435.556 616Z"
    fill="#000000"
  />
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
