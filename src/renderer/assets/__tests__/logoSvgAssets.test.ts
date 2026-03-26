import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAsset(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('logo asset sources', () => {
  it('uses a softly accented filled ribbon silhouette for the shared app icon', () => {
    const svg = readAsset('src/renderer/assets/logo.svg');

    expect(svg).toContain('<rect width="1024" height="1024" rx="236" fill="#151A22" />');
    expect(svg).toContain(
      '<rect x="36" y="36" width="952" height="952" rx="216" fill="#212934" />'
    );
    expect(svg).toContain('<rect x="662" y="278" width="136" height="468" rx="68" />');
    expect(svg).toContain('transform="translate(56 120) scale(0.76)"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('clip-rule="evenodd"');
    expect(svg).toContain('fill="#E5EBF5"');
    expect(svg).toContain('fill="#9BB8F2"');
    expect(svg).toContain('opacity="0.24"');
    expect(svg).not.toContain('stroke="url(#ribbonStroke)"');
    expect(svg).not.toContain('stroke-linecap="round"');
    expect(svg).not.toContain('<circle cx="288" cy="384" r="158" fill="#0A1624" />');
    expect(svg).not.toContain('<circle cx="582" cy="224" r="34" fill="#F8FAFC" />');
  });

  it('uses a monochrome filled ribbon for tray assets', () => {
    const svg = readAsset('src/renderer/assets/logo-mono.svg');

    expect(svg).toContain('transform="translate(28 62) scale(0.34)"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('clip-rule="evenodd"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).not.toContain('stroke="#000000"');
    expect(svg).not.toContain('<circle cx="176" cy="256" r="138" fill="#000000" />');
    expect(svg).not.toContain('<circle cx="336" cy="256" r="138" fill="#000000" />');
  });
});
