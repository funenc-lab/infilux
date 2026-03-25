import { describe, expect, it } from 'vitest';
import { shouldReturnEmptyFileList } from '../fileListPolicy';

describe('fileListPolicy', () => {
  it('treats missing directories as empty results', () => {
    expect(shouldReturnEmptyFileList({ code: 'ENOENT' })).toBe(true);
    expect(shouldReturnEmptyFileList({ code: 'ENOTDIR' })).toBe(true);
  });

  it('does not hide unrelated file list errors', () => {
    expect(shouldReturnEmptyFileList({ code: 'EACCES' })).toBe(false);
    expect(shouldReturnEmptyFileList(new Error('boom'))).toBe(false);
  });
});
