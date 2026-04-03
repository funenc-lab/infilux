import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRendererIndexHtml(): string {
  return readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8');
}

describe('static bootstrap shell', () => {
  it('does not hardcode the startup progress fill to a fake 40 percent width', () => {
    const source = readRendererIndexHtml();

    expect(source).not.toContain('width: 40%;');
    expect(source).toContain('width: var(--bootstrap-progress-value, 25%);');
  });
});
