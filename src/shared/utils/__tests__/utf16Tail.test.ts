import { describe, expect, it } from 'vitest';
import { takeUtf16Tail } from '../utf16Tail';

describe('takeUtf16Tail', () => {
  it('does not begin a bounded tail with a low surrogate', () => {
    const value = `A\u{1F680}BC`;

    expect(takeUtf16Tail(value, 3)).toBe('BC');
  });

  it('keeps a complete surrogate pair when it fits within the tail budget', () => {
    const value = `A\u{1F680}BC`;

    expect(takeUtf16Tail(value, 4)).toBe(`\u{1F680}BC`);
  });

  it('returns an empty string for a non-positive tail budget', () => {
    expect(takeUtf16Tail('output', 0)).toBe('');
    expect(takeUtf16Tail('output', -1)).toBe('');
  });

  it('returns the original value when it fits within the tail budget', () => {
    const value = `A\u{1F680}BC`;

    expect(takeUtf16Tail(value, value.length)).toBe(value);
    expect(takeUtf16Tail(value, value.length + 1)).toBe(value);
  });
});
