import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appResourceStatusPopoverSource = readFileSync(
  resolve(currentDir, '../AppResourceStatusPopover.tsx'),
  'utf8'
);
const runningProjectsPopoverSource = readFileSync(
  resolve(currentDir, '../RunningProjectsPopover.tsx'),
  'utf8'
);

describe('app resource status popover icon policy', () => {
  it('uses a dedicated runtime metrics icon instead of the running projects activity glyph', () => {
    expect(appResourceStatusPopoverSource).toContain('Gauge');
    expect(appResourceStatusPopoverSource).not.toContain('Activity');
    expect(runningProjectsPopoverSource).toContain('Activity');
  });
});
