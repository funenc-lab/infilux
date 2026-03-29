import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepositorySidebarSource(): string {
  return readFileSync(
    join(process.cwd(), 'src/renderer/components/layout/RepositorySidebar.tsx'),
    'utf8'
  );
}

describe('RepositorySidebar extraction policy', () => {
  it('delegates repository row rendering to a dedicated RepositoryTreeItem component', () => {
    const source = readRepositorySidebarSource();

    expect(source).toContain('<RepositoryTreeItem');
  });
});
