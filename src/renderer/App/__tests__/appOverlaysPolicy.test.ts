import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppSource(): string {
  return readFileSync(join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
}

describe('App overlays policy', () => {
  it('delegates overlay and dialog rendering to a dedicated AppOverlays component', () => {
    const source = readAppSource();

    expect(source).toContain('<AppOverlays');
  });
});
