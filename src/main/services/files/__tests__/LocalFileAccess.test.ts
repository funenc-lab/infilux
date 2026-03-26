import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

describe('LocalFileAccess', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('tracks allowed roots by owner on Unix-like platforms', async () => {
    setPlatform('linux');

    const localFileAccess = await import('../LocalFileAccess');

    localFileAccess.registerAllowedLocalFileRoot('/tmp/demo/', 101);
    localFileAccess.registerAllowedLocalFileRoot('/tmp/demo', 'global');

    expect(localFileAccess.isAllowedLocalFilePath('/tmp/demo')).toBe(true);
    expect(localFileAccess.isAllowedLocalFilePath('/tmp/demo/nested/file.png')).toBe(true);
    expect(localFileAccess.isAllowedLocalFilePath('/tmp/demo-sibling/file.png')).toBe(false);

    localFileAccess.unregisterAllowedLocalFileRoot('/tmp/demo', 101);
    expect(localFileAccess.isAllowedLocalFilePath('/tmp/demo/nested/file.png')).toBe(true);

    localFileAccess.unregisterAllowedLocalFileRootsByOwner('global');
    expect(localFileAccess.isAllowedLocalFilePath('/tmp/demo/nested/file.png')).toBe(false);
  });

  it('normalizes Darwin paths case-insensitively and removes owner roots', async () => {
    setPlatform('darwin');

    const localFileAccess = await import('../LocalFileAccess');

    localFileAccess.registerAllowedLocalFileRoot('/Users/Tester/Project/', 'desktop-owner');

    expect(localFileAccess.isAllowedLocalFilePath('/users/tester/project/src/index.ts')).toBe(true);
    expect(localFileAccess.isAllowedLocalFilePath('/Users/Tester/Other/index.ts')).toBe(false);

    localFileAccess.unregisterAllowedLocalFileRootsByOwner('desktop-owner');
    expect(localFileAccess.isAllowedLocalFilePath('/users/tester/project/src/index.ts')).toBe(
      false
    );
  });
});
