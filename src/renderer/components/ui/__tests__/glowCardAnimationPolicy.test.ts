import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const glowCardSource = readFileSync(resolve(currentDir, '../glow-card.tsx'), 'utf8');

describe('GlowCard animation policy', () => {
  it('supports an explicit animated mode for running session glow layers', () => {
    expect(glowCardSource).toContain('animated?: boolean;');
    expect(glowCardSource).toContain('function RunningGlow({ animated }: { animated: boolean })');
    expect(glowCardSource).toContain('return animated ? (');
    expect(glowCardSource).toContain('<motion.div');
  });
});
