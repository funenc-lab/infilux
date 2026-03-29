import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRendererEnvironment } from '../electronEnvironment';

describe('electronEnvironment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to browser defaults when the Electron bridge env is unavailable', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    vi.stubGlobal('window', {});

    expect(getRendererEnvironment()).toEqual({
      HOME: '',
      platform: 'darwin',
      appVersion: '0.0.0',
    });
  });

  it('prefers preload environment values when they are available', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          HOME: '/Users/tester',
          platform: 'linux',
          appVersion: '1.2.3',
        },
      },
    });

    expect(getRendererEnvironment()).toEqual({
      HOME: '/Users/tester',
      platform: 'linux',
      appVersion: '1.2.3',
    });
  });
});
