import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const tokenUsagePopoverSource = readFileSync(
  resolve(currentDir, '../TokenUsagePopover.tsx'),
  'utf8'
);
const appResourceStatusPopoverSource = readFileSync(
  resolve(currentDir, '../AppResourceStatusPopover.tsx'),
  'utf8'
);

describe('token usage popover icon policy', () => {
  it('uses a usage analytics icon instead of the runtime resource gauge', () => {
    expect(tokenUsagePopoverSource).toContain('ChartNoAxesColumnIncreasing');
    expect(tokenUsagePopoverSource).not.toContain('Gauge');
    expect(appResourceStatusPopoverSource).toContain('Gauge');
  });
});
