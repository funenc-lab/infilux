import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const statusLineSource = readFileSync(resolve(currentDir, '../StatusLine.tsx'), 'utf8');
const statusLineInputAvailabilitySource = readFileSync(
  resolve(currentDir, '../statusLineInputAvailability.ts'),
  'utf8'
);

describe('status line input availability policy', () => {
  it('surfaces non-ready input availability in the status line even without usage metrics', () => {
    expect(statusLineSource).toContain('resolveAgentInputAvailability');
    expect(statusLineSource).toContain("inputAvailability !== 'ready'");
    expect(statusLineSource).toContain('key="inputAvailability"');
    expect(statusLineSource).toContain('title={inputAvailabilityReason}');
  });

  it('uses a dedicated presentation model so each unavailable state has a distinct status style', () => {
    expect(statusLineSource).toContain('getStatusLineInputAvailabilityPresentation');
    expect(statusLineSource).toContain('STATUS_LINE_INPUT_AVAILABILITY_ICON_MAP');
    expect(statusLineInputAvailabilitySource).toContain("iconName: 'clock'");
    expect(statusLineInputAvailabilitySource).toContain("iconName: 'loader-circle'");
    expect(statusLineInputAvailabilitySource).toContain("iconName: 'alert-triangle'");
    expect(statusLineInputAvailabilitySource).toContain("itemClassName: 'text-info'");
    expect(statusLineInputAvailabilitySource).toContain("itemClassName: 'text-warning'");
    expect(statusLineInputAvailabilitySource).toContain("itemClassName: 'text-destructive'");
  });
});
