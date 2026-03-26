import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppSource(): string {
  return readFileSync(join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
}

describe('App file sidebar ordering', () => {
  it('declares the resolved file sidebar root before effects that read it', () => {
    const source = readAppSource();

    const referenceIndex = source.indexOf('const nextWorktreePath = fileSidebarRootPath;');
    const declarationIndex = source.indexOf(
      'const { shouldRender: shouldRenderFileSidebar, rootPath: fileSidebarRootPath } ='
    );

    expect(referenceIndex).toBeGreaterThan(-1);
    expect(declarationIndex).toBeGreaterThan(-1);
    expect(declarationIndex).toBeLessThan(referenceIndex);
  });
});
