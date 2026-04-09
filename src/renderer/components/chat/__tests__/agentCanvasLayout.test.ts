import { describe, expect, it } from 'vitest';
import { resolveAgentCanvasColumnCount } from '../agentCanvasLayout';

describe('resolveAgentCanvasColumnCount', () => {
  it('uses one column for a single session', () => {
    expect(resolveAgentCanvasColumnCount(1)).toBe(1);
  });

  it('uses two columns for two to four sessions', () => {
    expect(resolveAgentCanvasColumnCount(2)).toBe(2);
    expect(resolveAgentCanvasColumnCount(4)).toBe(2);
  });

  it('caps the automatic canvas at three columns for dense layouts', () => {
    expect(resolveAgentCanvasColumnCount(5)).toBe(3);
    expect(resolveAgentCanvasColumnCount(8)).toBe(3);
  });
});
