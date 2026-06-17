import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageJson {
  pnpm?: {
    ignoredBuiltDependencies?: string[];
    onlyBuiltDependencies?: string[];
  };
}

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as PackageJson;

const releaseNativeBuildDependencies = [
  '@parcel/watcher',
  '@vscode/ripgrep',
  'cloudflared',
  'electron',
  'electron-winstaller',
  'esbuild',
  'node-pty',
];

describe('pnpm build dependency policy', () => {
  it('approves native build scripts that release CI needs on all packaging platforms', () => {
    expect(packageJson.pnpm?.onlyBuiltDependencies).toEqual(
      expect.arrayContaining(releaseNativeBuildDependencies)
    );
  });

  it('keeps sqlite3 package install scripts under explicit pnpm ignore policy', () => {
    expect(packageJson.pnpm?.ignoredBuiltDependencies).toContain('sqlite3');
  });
});
