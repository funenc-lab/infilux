import { describe, expect, it } from 'vitest';
import {
  AGENT_CANVAS_GRID_COLUMN_UNITS,
  resolveAgentCanvasColumnCount,
  resolveAgentCanvasTileColumnSpan,
} from '../agentCanvasLayout';

describe('resolveAgentCanvasColumnCount', () => {
  it('uses one column for a single session', () => {
    expect(resolveAgentCanvasColumnCount(1)).toBe(1);
    expect(resolveAgentCanvasColumnCount(1, 480)).toBe(1);
  });

  it('uses two columns for two to four sessions on roomy viewports', () => {
    expect(resolveAgentCanvasColumnCount(2)).toBe(2);
    expect(resolveAgentCanvasColumnCount(4)).toBe(2);
    expect(resolveAgentCanvasColumnCount(2, 960)).toBe(2);
    expect(resolveAgentCanvasColumnCount(4, 960)).toBe(2);
  });

  it('caps the automatic canvas at three columns for dense layouts on wide viewports', () => {
    expect(resolveAgentCanvasColumnCount(5)).toBe(3);
    expect(resolveAgentCanvasColumnCount(8)).toBe(3);
    expect(resolveAgentCanvasColumnCount(5, 1280)).toBe(3);
    expect(resolveAgentCanvasColumnCount(8, 1280)).toBe(3);
  });

  it('falls back to two columns when the viewport cannot sustain three tiles', () => {
    expect(resolveAgentCanvasColumnCount(5, 1080)).toBe(2);
    expect(resolveAgentCanvasColumnCount(8, 1080)).toBe(2);
  });

  it('falls back to one column on narrow viewports regardless of session density', () => {
    expect(resolveAgentCanvasColumnCount(2, 640)).toBe(1);
    expect(resolveAgentCanvasColumnCount(8, 640)).toBe(1);
  });

  it('ignores invalid viewport widths and keeps the session-density policy', () => {
    expect(resolveAgentCanvasColumnCount(5, Number.NaN)).toBe(3);
    expect(resolveAgentCanvasColumnCount(5, 0)).toBe(3);
  });

  it('expands the trailing tile in two-column layouts so a close leaves no empty half row', () => {
    expect(AGENT_CANVAS_GRID_COLUMN_UNITS).toBe(12);
    expect(
      Array.from({ length: 3 }, (_, index) => resolveAgentCanvasTileColumnSpan(3, index))
    ).toEqual([6, 6, 12]);
  });

  it('rebalances partial three-column rows so the remaining agents fill the row width', () => {
    expect(
      Array.from({ length: 5 }, (_, index) => resolveAgentCanvasTileColumnSpan(5, index))
    ).toEqual([4, 4, 4, 6, 6]);

    expect(
      Array.from({ length: 7 }, (_, index) => resolveAgentCanvasTileColumnSpan(7, index))
    ).toEqual([4, 4, 4, 4, 4, 4, 12]);
  });

  it('uses the resolved responsive column count when filling partial rows', () => {
    expect(
      Array.from({ length: 5 }, (_, index) => resolveAgentCanvasTileColumnSpan(5, index, 2))
    ).toEqual([6, 6, 6, 6, 12]);

    expect(
      Array.from({ length: 3 }, (_, index) => resolveAgentCanvasTileColumnSpan(3, index, 1))
    ).toEqual([12, 12, 12]);
  });
});
