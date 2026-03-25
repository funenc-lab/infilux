import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERMINAL_SCROLLBACK,
  MAX_TERMINAL_SCROLLBACK,
  MIN_TERMINAL_SCROLLBACK,
  normalizeTerminalScrollback,
  TERMINAL_SCROLLBACK_OPTIONS,
} from '../terminalScrollbackPolicy';

describe('terminalScrollbackPolicy', () => {
  it('uses a reduced default scrollback and bounded options', () => {
    expect(DEFAULT_TERMINAL_SCROLLBACK).toBe(5000);
    expect(MIN_TERMINAL_SCROLLBACK).toBe(1000);
    expect(MAX_TERMINAL_SCROLLBACK).toBe(20000);
    expect(TERMINAL_SCROLLBACK_OPTIONS).toEqual([1000, 5000, 10000, 20000]);
  });

  it('normalizes invalid, fractional, and oversized values', () => {
    expect(normalizeTerminalScrollback(undefined)).toBe(DEFAULT_TERMINAL_SCROLLBACK);
    expect(normalizeTerminalScrollback('750')).toBe(MIN_TERMINAL_SCROLLBACK);
    expect(normalizeTerminalScrollback(4200.8)).toBe(4200);
    expect(normalizeTerminalScrollback(50000)).toBe(MAX_TERMINAL_SCROLLBACK);
  });
});
