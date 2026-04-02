import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

function readJsonFile(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function parseBetaVersion(value: string): {
  major: number;
  minor: number;
  patch: number;
  beta: number;
} | null {
  const match = value.match(/^\^?(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    beta: Number.parseInt(match[4], 10),
  };
}

describe('node-pty dependency policy', () => {
  it('pins an installed version that satisfies the minimum required by @xterm/xterm', () => {
    const rootPackage = readJsonFile(
      new URL('../../../../../package.json', import.meta.url).pathname
    );
    const xtermPackage = readJsonFile(require.resolve('@xterm/xterm/package.json'));
    const installedNodePty = readJsonFile(require.resolve('node-pty/package.json'));

    const rootDependencies = (rootPackage.dependencies as Record<string, string> | undefined) ?? {};
    const xtermDevDependencies =
      (xtermPackage.devDependencies as Record<string, string> | undefined) ?? {};
    const installedVersion = installedNodePty.version;
    const minimumRequiredVersion = xtermDevDependencies['node-pty'];

    expect(typeof installedVersion).toBe('string');
    expect(rootDependencies['node-pty']).toBe(installedVersion);

    const parsedInstalledVersion = parseBetaVersion(String(installedVersion));
    const parsedMinimumRequiredVersion = parseBetaVersion(String(minimumRequiredVersion));

    expect(parsedInstalledVersion).not.toBeNull();
    expect(parsedMinimumRequiredVersion).not.toBeNull();
    expect(parsedInstalledVersion).toMatchObject({
      major: parsedMinimumRequiredVersion?.major,
      minor: parsedMinimumRequiredVersion?.minor,
      patch: parsedMinimumRequiredVersion?.patch,
    });
    expect((parsedInstalledVersion?.beta ?? -1) >= (parsedMinimumRequiredVersion?.beta ?? 0)).toBe(
      true
    );
  });
});
