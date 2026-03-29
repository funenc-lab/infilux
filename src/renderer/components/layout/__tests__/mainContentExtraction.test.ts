import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readMainContentSource(): string {
  return readFileSync(
    join(process.cwd(), 'src/renderer/components/layout/MainContent.tsx'),
    'utf8'
  );
}

describe('MainContent extraction policy', () => {
  it('delegates topbar rendering to a dedicated MainContentTopbar component', () => {
    const source = readMainContentSource();

    expect(source).toContain('<MainContentTopbar');
  });
});
