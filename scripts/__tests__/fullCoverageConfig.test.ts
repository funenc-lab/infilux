import { describe, expect, it } from 'vitest';
import unitConfig from '../../vitest.config';
import fullCoverageConfig from '../../vitest.full.config';

describe('full coverage configuration', () => {
  it('uses the same test timeout as the unit suite', () => {
    expect(fullCoverageConfig.test?.testTimeout).toBe(unitConfig.test?.testTimeout);
  });

  it('uses the same worker limit as the unit suite', () => {
    expect(fullCoverageConfig.test?.maxWorkers).toBe(unitConfig.test?.maxWorkers);
  });

  it('preserves repository-wide coverage scope and thresholds', () => {
    expect(fullCoverageConfig.test?.include).toEqual(['src/**/__tests__/**/*.test.ts']);
    expect(fullCoverageConfig.test?.coverage).toMatchObject({
      provider: 'v8',
      include: [
        'src/main/**/*.ts',
        'src/preload/**/*.ts',
        'src/renderer/**/*.ts',
        'src/renderer/**/*.tsx',
        'src/shared/**/*.ts',
      ],
      thresholds: {
        statements: 39,
        lines: 39,
        branches: 82,
        functions: 72,
      },
    });
  });
});
