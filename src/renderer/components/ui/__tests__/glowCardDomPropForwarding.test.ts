import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const glowCardSource = readFileSync(resolve(currentDir, '../glow-card.tsx'), 'utf8');

describe('GlowCard DOM prop forwarding', () => {
  it('forwards trigger interaction props to the rendered DOM node', () => {
    expect(glowCardSource).toContain('...restProps');
    expect(glowCardSource).toMatch(/<Component[\s\S]*\{\.{3}restProps\}/m);
  });
});
