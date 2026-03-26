import { describe, expect, it } from 'vitest';
import { getReadabilityWhitespaceLabelKey } from '../editorReadabilityLabels';

describe('getReadabilityWhitespaceLabelKey', () => {
  it.each([
    ['none', 'None'],
    ['boundary', 'Boundary'],
    ['selection', 'Selection'],
    ['trailing', 'Trailing'],
    ['all', 'All'],
  ] as const)('maps %s to %s', (value, expected) => {
    expect(getReadabilityWhitespaceLabelKey(value)).toBe(expected);
  });
});
