import { describe, expect, it } from 'vitest';
import {
  JSON_LINE_MAX_CHARS,
  JsonLineBuffer,
  JsonLineBufferOverflowError,
} from '../JsonLineBuffer';

describe('JsonLineBuffer', () => {
  it('emits complete lines across arbitrary chunk boundaries', () => {
    const buffer = new JsonLineBuffer();

    expect(buffer.push('{"id":1')).toEqual([]);
    expect(buffer.push('}\n{"id":2}\n')).toEqual(['{"id":1}', '{"id":2}']);
  });

  it('clears an oversized unterminated line before accepting a later message', () => {
    const buffer = new JsonLineBuffer();

    expect(() => buffer.push('x'.repeat(JSON_LINE_MAX_CHARS + 1))).toThrow(
      JsonLineBufferOverflowError
    );
    expect(buffer.push('{"id":3}\n')).toEqual(['{"id":3}']);
  });
});
