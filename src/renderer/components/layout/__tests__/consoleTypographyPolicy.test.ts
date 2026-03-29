import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const consoleEmptyStateSource = readFileSync(
  resolve(currentDir, '../ConsoleEmptyState.tsx'),
  'utf8'
);
const consoleTypographySource = readFileSync(
  resolve(currentDir, '../consoleTypography.ts'),
  'utf8'
);
const emptyPrimitiveSource = readFileSync(resolve(currentDir, '../../ui/empty.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

describe('console typography policy', () => {
  it('defines semantic typography utilities for shared empty-state surfaces', () => {
    expect(globalsSource).toContain('.ui-type-label');
    expect(globalsSource).toContain('.ui-type-body-sm');
    expect(globalsSource).toContain('.ui-type-body-md');
    expect(globalsSource).toContain('.ui-type-title-md');
    expect(globalsSource).toContain('.ui-type-title-lg');
  });

  it('uses semantic typography utilities in the shared empty primitive', () => {
    expect(emptyPrimitiveSource).toContain('ui-type-title-md');
    expect(emptyPrimitiveSource).toContain('ui-type-body-sm');
    expect(emptyPrimitiveSource).not.toContain('text-lg font-semibold');
    expect(emptyPrimitiveSource).not.toContain('text-sm leading-6');
  });

  it('uses console typography tokens instead of hardcoded rem values', () => {
    expect(consoleTypographySource).toContain('eyebrowFontSize');
    expect(consoleTypographySource).toContain('panelTitleFontSize');
    expect(consoleTypographySource).toContain('embeddedTitleFontSize');
    expect(consoleTypographySource).toContain('detailValueFontSize');
    expect(consoleEmptyStateSource).toContain('--console-text-eyebrow-size');
    expect(consoleEmptyStateSource).toContain('--console-text-title-size');
    expect(consoleEmptyStateSource).toContain('--console-text-body-size');
    expect(consoleEmptyStateSource).toContain('--console-text-detail-value-size');
    expect(consoleEmptyStateSource).not.toContain('text-[1.4rem]');
    expect(consoleEmptyStateSource).not.toContain('text-[1.18rem]');
    expect(consoleEmptyStateSource).not.toContain('text-[1.07em]');
    expect(consoleEmptyStateSource).not.toContain('text-[0.79em]');
  });
});
