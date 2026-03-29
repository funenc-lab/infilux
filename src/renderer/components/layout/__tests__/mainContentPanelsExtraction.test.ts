import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readMainContentSource(): string {
  return readFileSync(
    join(process.cwd(), 'src/renderer/components/layout/MainContent.tsx'),
    'utf8'
  );
}

describe('MainContent panels extraction policy', () => {
  it('delegates content panel rendering to a dedicated MainContentPanels component', () => {
    const source = readMainContentSource();

    expect(source).toContain('<MainContentPanels');
  });
});
