import { describe, expect, it } from 'vitest';
import { getFileStatusTextClass, getFileStatusTone } from '../fileStatusTone';

describe('fileStatusTone', () => {
  it('maps file change statuses to semantic tones', () => {
    expect(getFileStatusTone('A')).toBe('success');
    expect(getFileStatusTone('M')).toBe('warning');
    expect(getFileStatusTone('R')).toBe('info');
    expect(getFileStatusTone('D')).toBe('destructive');
    expect(getFileStatusTone('X')).toBe('destructive');
    expect(getFileStatusTone('?')).toBe('muted');
  });

  it('returns token-backed text classes', () => {
    expect(getFileStatusTextClass('A')).toBe('text-success');
    expect(getFileStatusTextClass('M')).toBe('text-warning');
    expect(getFileStatusTextClass('R')).toBe('text-info');
    expect(getFileStatusTextClass('D')).toBe('text-destructive');
    expect(getFileStatusTextClass('unknown')).toBe('text-muted-foreground');
  });
});
