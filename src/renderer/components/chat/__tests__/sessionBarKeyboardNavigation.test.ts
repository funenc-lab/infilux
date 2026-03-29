import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');

describe('SessionBar keyboard navigation', () => {
  it('supports arrow, home, and end navigation for floating session tabs', () => {
    expect(sessionBarSource).toContain("case 'ArrowRight'");
    expect(sessionBarSource).toContain("case 'ArrowLeft'");
    expect(sessionBarSource).toContain("case 'Home'");
    expect(sessionBarSource).toContain("case 'End'");
  });

  it('keeps only the active tab in the regular tab order', () => {
    expect(sessionBarSource).toContain('tabIndex={isActive ? 0 : -1}');
  });

  it('links keyboard navigation to session ids and focus restoration', () => {
    expect(sessionBarSource).toContain('buildSessionTabId(targetSession.id)');
    expect(sessionBarSource).toContain('window.requestAnimationFrame(() => targetTab?.focus())');
  });
});
