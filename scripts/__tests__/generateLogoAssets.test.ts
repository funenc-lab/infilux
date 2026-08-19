import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const trayIconDensities = [
  { fileName: 'iconTemplate.png', size: 18 },
  { fileName: 'iconTemplate@2x.png', size: 36 },
  { fileName: 'iconTemplate@3x.png', size: 54 },
];

function createGeneratorFixture(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'infilux-logo-assets-'));
  const scriptsDirectory = join(fixtureRoot, 'scripts');

  mkdirSync(scriptsDirectory, { recursive: true });
  cpSync(
    join(workspaceRoot, 'scripts', 'generate-logo-assets.sh'),
    join(scriptsDirectory, 'generate-logo-assets.sh')
  );
  cpSync(
    join(workspaceRoot, 'src', 'renderer', 'assets'),
    join(fixtureRoot, 'src', 'renderer', 'assets'),
    {
      recursive: true,
    }
  );

  return fixtureRoot;
}

describe('logo asset generator', () => {
  it('renders transparent macOS tray icons at every density', () => {
    const fixtureRoot = createGeneratorFixture();

    try {
      execFileSync('bash', ['scripts/generate-logo-assets.sh', '--tray-only'], {
        cwd: fixtureRoot,
        stdio: 'pipe',
      });

      for (const { fileName, size } of trayIconDensities) {
        const iconPath = join(fixtureRoot, 'build', 'tray', fileName);
        const metadata = execFileSync(
          'magick',
          ['identify', '-format', '%w %h %[opaque] %[pixel:p{0,0}]', iconPath],
          { encoding: 'utf8' }
        ).trim();

        expect(metadata).toBe(`${size} ${size} False srgba(0,0,0,0)`);
      }
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});
