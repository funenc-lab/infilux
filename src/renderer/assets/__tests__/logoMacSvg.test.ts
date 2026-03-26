import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAsset(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('logo-mac.svg', () => {
  it('uses a mac-specific safe area with a softly accented filled ribbon silhouette', () => {
    const svg = readAsset('src/renderer/assets/logo-mac.svg');

    expect(svg).toContain(
      '<rect x="112" y="112" width="800" height="800" rx="180" fill="#171A20" />'
    );
    expect(svg).toContain(
      '<rect x="136" y="136" width="752" height="752" rx="160" fill="#232930" />'
    );
    expect(svg).toContain('<rect x="642" y="314" width="118" height="372" rx="59" />');
    expect(svg).toContain('transform="translate(92 154) scale(0.68)"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('clip-rule="evenodd"');
    expect(svg).toContain('fill="#EEE6DA"');
    expect(svg).toContain('fill="#B85D50"');
    expect(svg).toContain('opacity="0.26"');
    expect(svg).not.toContain('stroke="url(#ribbonStroke)"');
    expect(svg).not.toContain('<circle cx="408" cy="512" r="212" fill="#0A1624" />');
    expect(svg).not.toContain('<circle cx="616" cy="512" r="212" fill="#0A1624" />');
    expect(svg).not.toContain('<circle cx="776" cy="288" r="44" fill="#F8FAFC" />');
    expect(svg).not.toContain('#9BB8F2');
  });

  it('provides a light-scene mac variant with warm surfaces and darker ribbon contrast', () => {
    const svg = readAsset('src/renderer/assets/logo-mac-light.svg');

    expect(svg).toContain(
      '<rect x="112" y="112" width="800" height="800" rx="180" fill="#DED1C3" />'
    );
    expect(svg).toContain(
      '<rect x="136" y="136" width="752" height="752" rx="160" fill="#F7F1E9" />'
    );
    expect(svg).toContain('fill="#22272F"');
    expect(svg).toContain('fill="#A24E44"');
    expect(svg).toContain('opacity="0.22"');
    expect(svg).not.toContain('#9BB8F2');
  });
});
