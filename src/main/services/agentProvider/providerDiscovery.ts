import type { AgentProviderDiscoveryOptions } from '@shared/types';

function normalizeCustomExecutablePath(
  discoveryOptions?: AgentProviderDiscoveryOptions
): string | null {
  const customPath = discoveryOptions?.customPath?.trim();
  if (!customPath) {
    return null;
  }

  return customPath.replace(/\\/gu, '/');
}

export function resolveWindowsUserHomeFromExecutablePath(
  discoveryOptions?: AgentProviderDiscoveryOptions
): string | null {
  if (process.platform !== 'win32') {
    return null;
  }

  const customExecutablePath = normalizeCustomExecutablePath(discoveryOptions);
  if (!customExecutablePath) {
    return null;
  }

  const segments = customExecutablePath.split('/').filter((segment) => segment.length > 0);
  const markerIndex = segments.findIndex(
    (segment, index) =>
      (segment === 'Users' || segment === 'Documents and Settings') &&
      typeof segments[index + 1] === 'string' &&
      segments[index + 1].length > 0
  );

  if (markerIndex < 0) {
    return null;
  }

  const homeSegments = segments.slice(0, markerIndex + 2);
  if (/^[A-Za-z]:$/u.test(homeSegments[0] ?? '')) {
    return homeSegments.join('\\');
  }

  return `${customExecutablePath.startsWith('/') ? '/' : ''}${homeSegments.join('/')}`;
}
