import { APP_RUNTIME_NAMESPACE } from '@shared/utils/runtimeIdentity';
import { describe, expect, it, vi } from 'vitest';
import pkg from '../../../../../package.json';

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/app'),
    getPath: vi.fn(() => '/user-data'),
    isPackaged: false,
  },
}));

describe('RemoteRuntimeAssets', () => {
  it('uses the app release version in managed Linux runtime asset names and URLs', async () => {
    const { getRemoteRuntimeAsset, MANAGED_REMOTE_NODE_VERSION } = await import(
      '../RemoteRuntimeAssets'
    );

    const asset = getRemoteRuntimeAsset('linux', 'x64');
    const expectedArchiveName = `${APP_RUNTIME_NAMESPACE}-remote-runtime-v${pkg.version}-node-v${MANAGED_REMOTE_NODE_VERSION}-linux-x64.tar.gz`;

    expect(asset.archiveName).toBe(expectedArchiveName);
    expect(asset.checksumFileName).toBe(`${expectedArchiveName}.sha256`);
    expect(asset.url).toBe(
      `https://github.com/funenc-lab/infilux/releases/download/v${pkg.version}/${expectedArchiveName}`
    );
    expect(asset.checksumUrl).toBe(`${asset.url}.sha256`);
  });
});
