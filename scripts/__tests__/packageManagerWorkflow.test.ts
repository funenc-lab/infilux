import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflowSource = readFileSync(
  new URL('../../.github/workflows/update-package-managers.yml', import.meta.url),
  'utf8'
);
const tagPlaceholder = '$' + '{TAG}';
const versionPlaceholder = '$' + '{VERSION}';
const homebrewArm64Asset = `https://github.com/funenc-lab/infilux/releases/download/${tagPlaceholder}/Infilux-${versionPlaceholder}-arm64.dmg`;
const homebrewX64Asset = `https://github.com/funenc-lab/infilux/releases/download/${tagPlaceholder}/Infilux-${versionPlaceholder}.dmg`;
const windowsInstallerAsset = `https://github.com/funenc-lab/infilux/releases/download/${tagPlaceholder}/Infilux Setup ${versionPlaceholder}.exe`;
const aurSourceArchive = `https://github.com/funenc-lab/infilux/archive/refs/tags/${tagPlaceholder}.tar.gz`;

describe('legacy package manager workflow policy', () => {
  it('downloads release assets from the current Infilux repository and asset names', () => {
    expect(workflowSource).toContain(homebrewArm64Asset);
    expect(workflowSource).toContain(homebrewX64Asset);
    expect(workflowSource).toContain(windowsInstallerAsset);
    expect(workflowSource).toContain(aurSourceArchive);
  });

  it('uses current runtime application names inside generated package-manager manifests', () => {
    expect(workflowSource).toContain('app "Infilux.app"');
    expect(workflowSource).toContain('~/Library/Application Support/Infilux');
    expect(workflowSource).toContain('~/Library/Preferences/com.infilux.app.plist');
    expect(workflowSource).toContain('bin: "Infilux.exe"');
    expect(workflowSource).toContain('["Infilux.exe", "Infilux"]');
    expect(workflowSource).toContain('Name=Infilux');
  });

  it('no longer points package-manager metadata generation at the legacy EnsoAI release repository', () => {
    expect(workflowSource).not.toContain('https://github.com/J3n5en/EnsoAI/releases/download');
    expect(workflowSource).not.toContain('https://github.com/J3n5en/EnsoAI/archive/refs/tags');
  });
});
