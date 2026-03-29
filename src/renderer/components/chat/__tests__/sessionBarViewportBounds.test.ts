import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');

describe('SessionBar viewport bounds', () => {
  it('clamps the floating bar state back into the visible container', () => {
    expect(sessionBarSource).toContain('function clampFloatingBarState(');
    expect(sessionBarSource).toContain('const maxTop = Math.max(');
    expect(sessionBarSource).toContain('FLOATING_BAR_MARGIN_PX,');
    expect(sessionBarSource).toContain('containerHeight - barHeight - FLOATING_BAR_MARGIN_PX');
    expect(sessionBarSource).toContain(
      'const minCenterPx = Math.min(barWidth / 2 + FLOATING_BAR_MARGIN_PX'
    );
    expect(sessionBarSource).toContain('const nextX = clampNumber(');
  });

  it('re-applies bounds when the bar or window size changes', () => {
    expect(sessionBarSource).toContain('const syncFloatingBarBounds = () => {');
    expect(sessionBarSource).toContain('const observer = new ResizeObserver(() => {');
    expect(sessionBarSource).toContain("window.addEventListener('resize', syncFloatingBarBounds)");
    expect(sessionBarSource).toContain('observer.observe(container)');
    expect(sessionBarSource).toContain('observer.observe(bar)');
  });
});
