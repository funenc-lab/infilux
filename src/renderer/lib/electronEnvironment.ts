import type { BootstrapThemeSnapshot } from '@shared/utils/bootstrapTheme';
import type { AppRuntimeChannel } from '@shared/utils/runtimeIdentity';

export type RendererPlatform = 'darwin' | 'win32' | 'linux';

export interface RendererEnvironment {
  HOME: string;
  platform: RendererPlatform;
  appVersion: string;
  bootstrapTheme?: BootstrapThemeSnapshot | null;
  runtimeChannel: AppRuntimeChannel;
}

const DEFAULT_RENDERER_ENVIRONMENT: RendererEnvironment = {
  HOME: '',
  platform: 'linux',
  appVersion: '0.0.0',
  runtimeChannel: 'prod',
};

function resolvePlatformFromNavigator(): RendererPlatform {
  if (typeof navigator === 'undefined') {
    return DEFAULT_RENDERER_ENVIRONMENT.platform;
  }

  const normalizedPlatform = navigator.platform.toLowerCase();
  if (normalizedPlatform.includes('mac')) {
    return 'darwin';
  }
  if (normalizedPlatform.includes('win')) {
    return 'win32';
  }
  return 'linux';
}

export function getRendererEnvironment(): RendererEnvironment {
  const fallbackPlatform = resolvePlatformFromNavigator();
  const env = typeof window !== 'undefined' ? window.electronAPI?.env : undefined;

  return {
    HOME: env?.HOME ?? DEFAULT_RENDERER_ENVIRONMENT.HOME,
    platform: env?.platform ?? fallbackPlatform,
    appVersion: env?.appVersion ?? DEFAULT_RENDERER_ENVIRONMENT.appVersion,
    bootstrapTheme: env?.bootstrapTheme ?? null,
    runtimeChannel: env?.runtimeChannel ?? DEFAULT_RENDERER_ENVIRONMENT.runtimeChannel,
  };
}

export function getRendererPlatform(): RendererPlatform {
  return getRendererEnvironment().platform;
}
