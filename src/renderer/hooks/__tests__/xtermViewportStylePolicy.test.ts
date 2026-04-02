import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const globalsSource = readFileSync(resolve(currentDir, '../../styles/globals.css'), 'utf8');

describe('xterm viewport style policy', () => {
  it('does not force the internal xterm scroll area to 100% height', () => {
    expect(globalsSource).toContain('.xterm-viewport');
    expect(globalsSource).toContain('.xterm-screen');
    expect(globalsSource).not.toContain('.xterm-scroll-area,');
    expect(globalsSource).not.toContain('.xterm-scrollable-element');
  });
});
