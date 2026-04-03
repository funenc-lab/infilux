import { describe, expect, it } from 'vitest';

import {
  buildReleaseNotesMarkdown,
  getRequiredReleaseDownloadAssets,
  resolveReleaseDownloadAssets,
} from '../release/releaseMetadata.mjs';

describe('releaseMetadata', () => {
  it('resolves the current branded GitHub release assets in stable display order', () => {
    const assetNames = [
      'Infilux-1.2.3-arm64-mac.zip',
      'Infilux-1.2.3-arm64.dmg',
      'Infilux-1.2.3.dmg',
      'Infilux Setup 1.2.3.exe',
      'Infilux Setup 1.2.3.exe.blockmap',
      'Infilux-1.2.3-portable.exe',
      'Infilux-1.2.3.AppImage',
      'infilux_1.2.3_amd64.deb',
      'latest-mac.yml',
      'latest.yml',
      'enso-remote-runtime-v1-node-v22-linux-x64.tar.gz',
    ];

    expect(resolveReleaseDownloadAssets(assetNames)).toEqual([
      {
        key: 'macos-arm64',
        label: 'macOS (Apple Silicon)',
        fileName: 'Infilux-1.2.3-arm64.dmg',
      },
      {
        key: 'macos-x64',
        label: 'macOS (Intel)',
        fileName: 'Infilux-1.2.3.dmg',
      },
      {
        key: 'windows-installer',
        label: 'Windows (Installer)',
        fileName: 'Infilux Setup 1.2.3.exe',
      },
      {
        key: 'windows-portable',
        label: 'Windows (Portable)',
        fileName: 'Infilux-1.2.3-portable.exe',
      },
      {
        key: 'linux-appimage',
        label: 'Linux (AppImage)',
        fileName: 'Infilux-1.2.3.AppImage',
      },
      {
        key: 'linux-deb',
        label: 'Linux (deb)',
        fileName: 'infilux_1.2.3_amd64.deb',
      },
    ]);
  });

  it('throws a clear error when a required downloadable release asset is missing', () => {
    expect(() =>
      resolveReleaseDownloadAssets([
        'Infilux-1.2.3-arm64.dmg',
        'Infilux-1.2.3.dmg',
        'Infilux-1.2.3-portable.exe',
        'Infilux-1.2.3.AppImage',
        'infilux_1.2.3_amd64.deb',
      ])
    ).toThrowError(/Missing required release assets: windows-installer/);
  });

  it('builds release notes markdown from repository metadata, commits, and resolved assets', () => {
    const markdown = buildReleaseNotesMarkdown({
      tag: 'v1.2.3',
      previousTag: 'v1.2.2',
      repositorySlug: 'funenc-lab/infilux',
      commitSubjects: [
        'feat(release): automate github release publishing',
        'fix(ci): refresh release asset links',
        'build(workflow): remove duplicated release notes job',
      ],
      assets: resolveReleaseDownloadAssets([
        'Infilux-1.2.3-arm64.dmg',
        'Infilux-1.2.3.dmg',
        'Infilux Setup 1.2.3.exe',
        'Infilux-1.2.3-portable.exe',
        'Infilux-1.2.3.AppImage',
        'infilux_1.2.3_amd64.deb',
      ]),
    });

    expect(markdown).toContain('## Updates');
    expect(markdown).toContain('### ✨ Features');
    expect(markdown).toContain('### 🐛 Fixes');
    expect(markdown).toContain('### 🔨 Build & CI');
    expect(markdown).toContain(
      '[Infilux Setup 1.2.3.exe](https://github.com/funenc-lab/infilux/releases/download/v1.2.3/Infilux%20Setup%201.2.3.exe)'
    );
    expect(markdown).toContain(
      '**Full Changelog**: https://github.com/funenc-lab/infilux/compare/v1.2.2...v1.2.3'
    );
  });

  it('publishes the required release asset definitions for workflow consumers', () => {
    expect(getRequiredReleaseDownloadAssets().map((asset) => asset.key)).toEqual([
      'macos-arm64',
      'macos-x64',
      'windows-installer',
      'windows-portable',
      'linux-appimage',
      'linux-deb',
    ]);
  });
});
