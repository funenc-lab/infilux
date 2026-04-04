import { describe, expect, it } from 'vitest';
import electronViteConfig from '../../electron.vite.config';

describe('electron-vite renderer dev server config', () => {
  it('pins the renderer dev server to IPv4 localhost with a strict port', () => {
    expect(electronViteConfig.renderer?.server).toMatchObject({
      host: '127.0.0.1',
      strictPort: true,
    });
  });
});
