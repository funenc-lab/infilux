import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../release/generate-release-notes.mjs', import.meta.url));
const tempDirectories: string[] = [];
const assetNames = [
  'Infilux-1.2.3-arm64.dmg',
  'Infilux-1.2.3.dmg',
  'Infilux Setup 1.2.3.exe',
  'Infilux-1.2.3-portable.exe',
  'Infilux-1.2.3.AppImage',
  'infilux_1.2.3_amd64.deb',
];

function createDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'infilux-release-notes-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release notes CLI', () => {
  it.each(['signed', 'unsigned'])('generates notes with the actual %s macOS mode', (mode) => {
    const directory = createDirectory();
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
    const git = (args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Release Test',
          '-c',
          'user.email=release-test@example.invalid',
          '-c',
          'commit.gpgsign=false',
          '-c',
          'core.hooksPath=/dev/null',
          ...args,
        ],
        { cwd: directory, env, encoding: 'utf8' }
      );
    git(['init', '--quiet']);
    git(['commit', '--allow-empty', '--quiet', '-m', 'chore: initial fixture']);
    git(['tag', 'v1.2.2']);
    git(['commit', '--allow-empty', '--quiet', '-m', 'fix(agent): preserve terminal input']);
    git(['tag', 'v1.2.3']);
    const assetPath = join(directory, 'assets.txt');
    const outputPath = join(directory, 'notes.md');
    writeFileSync(assetPath, `${assetNames.join('\n')}\n`);

    const result = spawnSync(
      process.execPath,
      [
        script,
        '--tag',
        'v1.2.3',
        '--previous-tag',
        'v1.2.2',
        '--repository',
        'funenc-lab/infilux',
        '--asset-file',
        assetPath,
        '--macos-signing',
        mode,
        '--output',
        outputPath,
      ],
      { cwd: directory, env, encoding: 'utf8', timeout: 5000 }
    );

    expect(result.status).toBe(0);
    const markdown = readFileSync(outputPath, 'utf8');
    expect(markdown).toContain('preserve terminal input');
    expect(markdown).toContain('/compare/v1.2.2...v1.2.3');
    expect(markdown).toContain('Infilux%20Setup%201.2.3.exe');
    expect(markdown.includes('not signed with an Apple Developer ID')).toBe(mode === 'unsigned');
    expect(markdown.includes('Install and update macOS manually')).toBe(mode === 'unsigned');
  });

  it('rejects unknown signing modes before reading release files or git history', () => {
    const directory = createDirectory();
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--tag',
        'v1.2.3',
        '--previous-tag',
        'v1.2.2',
        '--repository',
        'funenc-lab/infilux',
        '--asset-file',
        join(directory, 'missing-assets.txt'),
        '--macos-signing',
        'invalid',
      ],
      { cwd: directory, encoding: 'utf8', timeout: 5000 }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('macOS signing mode must be signed or unsigned');
    expect(result.stderr).not.toContain('ENOENT');
  });
});
