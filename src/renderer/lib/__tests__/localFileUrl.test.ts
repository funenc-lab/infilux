import { describe, expect, it } from 'vitest';
import { toLocalFileBaseUrl, toLocalFileUrl } from '../localFileUrl';

describe('local file url helpers', () => {
  it('converts absolute filesystem paths to local-file protocol urls', () => {
    expect(toLocalFileUrl('/Users/tester/Projects/file name.ts')).toBe(
      'local-file:///Users/tester/Projects/file%20name.ts'
    );
    expect(toLocalFileUrl('C:\\Users\\tester\\Projects\\file name.ts')).toBe(
      'local-file:///C:/Users/tester/Projects/file%20name.ts'
    );
  });

  it('creates base urls with trailing slashes for directories and UNC roots', () => {
    expect(toLocalFileBaseUrl('/Users/tester/Projects').toString()).toBe(
      'local-file:///Users/tester/Projects/'
    );
    expect(
      toLocalFileBaseUrl('\\\\wsl.localhost\\Ubuntu\\home\\tester\\workspace').toString()
    ).toBe('local-file://wsl.localhost/Ubuntu/home/tester/workspace/');
  });
});
