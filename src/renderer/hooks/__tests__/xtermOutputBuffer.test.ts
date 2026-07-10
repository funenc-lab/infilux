import { describe, expect, it } from 'vitest';
import { XtermOutputBuffer } from '../xtermOutputBuffer';

describe('XtermOutputBuffer', () => {
  it('drains appended chunks in order without exceeding the requested write size', () => {
    const buffer = new XtermOutputBuffer();
    buffer.append('first ');
    buffer.append('second');

    expect(buffer.take(8)).toBe('first se');
    expect(buffer.charCount).toBe(4);
    expect(buffer.take(8)).toBe('cond');
    expect(buffer.hasPending).toBe(false);
  });

  it('clears pending output', () => {
    const buffer = new XtermOutputBuffer();
    buffer.append('pending output');

    buffer.clear();

    expect(buffer.charCount).toBe(0);
    expect(buffer.take()).toBe('');
  });

  it('does not split a surrogate pair across consecutive writes', () => {
    const buffer = new XtermOutputBuffer();
    buffer.append(`${'x'.repeat(7)}\ud83d`);
    buffer.append('\ude00tail');

    expect(buffer.take(8)).toBe(`${'x'.repeat(7)}\ud83d\ude00`);
    expect(buffer.take(8)).toBe('tail');
  });

  it('replaces excessive output with a bounded tail and prefix', () => {
    const buffer = new XtermOutputBuffer();

    buffer.replaceWithTail('abcdefghijklmnop', 10, '...');

    expect(buffer.charCount).toBe(10);
    expect(buffer.take()).toBe('...jklmnop');
  });

  it('keeps the retained tail within the requested limit at a surrogate boundary', () => {
    const buffer = new XtermOutputBuffer();

    buffer.replaceWithTail(`${'x'.repeat(7)}\ud83d\ude00tail`, 5);

    expect(buffer.charCount).toBeLessThanOrEqual(5);
    expect(buffer.take()).toBe('tail');
  });
});
