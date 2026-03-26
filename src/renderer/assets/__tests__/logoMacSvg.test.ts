import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readLogoMacSvg(): string {
  return readFileSync(join(process.cwd(), 'src/renderer/assets/logo-mac.svg'), 'utf8');
}

describe('logo-mac.svg', () => {
  it('uses a mac-specific safe area with a softly accented filled ribbon silhouette', () => {
    const svg = readLogoMacSvg();

    expect(svg).toContain(
      '<rect x="112" y="112" width="800" height="800" rx="180" fill="#151A22" />'
    );
    expect(svg).toContain(
      '<rect x="136" y="136" width="752" height="752" rx="160" fill="#212934" />'
    );
    expect(svg).toContain('<rect x="642" y="314" width="118" height="372" rx="59" />');
    expect(svg).toContain('transform="translate(92 154) scale(0.68)"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('clip-rule="evenodd"');
    expect(svg).toContain('fill="#E5EBF5"');
    expect(svg).toContain('fill="#9BB8F2"');
    expect(svg).toContain('opacity="0.24"');
    expect(svg).not.toContain('stroke="url(#ribbonStroke)"');
    expect(svg).not.toContain('<circle cx="408" cy="512" r="212" fill="#0A1624" />');
    expect(svg).not.toContain('<circle cx="616" cy="512" r="212" fill="#0A1624" />');
    expect(svg).not.toContain('<circle cx="776" cy="288" r="44" fill="#F8FAFC" />');
  });
});
