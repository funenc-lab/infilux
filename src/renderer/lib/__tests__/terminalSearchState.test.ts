import { describe, expect, it } from 'vitest';
import {
  buildTerminalSearchDecorations,
  createEmptyTerminalSearchState,
  createTerminalSearchState,
  getTerminalSearchStatusLabel,
} from '../terminalSearchState';

describe('terminalSearchState', () => {
  it('hides the status label until the user has an active search term and results', () => {
    expect(
      getTerminalSearchStatusLabel('', {
        resultIndex: 0,
        resultCount: 12,
        hasSearched: true,
      })
    ).toBeNull();
    expect(getTerminalSearchStatusLabel('agent', createEmptyTerminalSearchState())).toBeNull();
  });

  it('shows zero when the current search has no matches', () => {
    expect(
      getTerminalSearchStatusLabel('agent', {
        resultIndex: 0,
        resultCount: 0,
        hasSearched: true,
      })
    ).toBe('0');
  });

  it('shows the active result position when matches exist', () => {
    expect(
      getTerminalSearchStatusLabel('agent', {
        resultIndex: 2,
        resultCount: 18,
        hasSearched: true,
      })
    ).toBe('3/18');
  });

  it('creates a searched state and clamps negative result counts to zero', () => {
    expect(
      createTerminalSearchState({
        resultIndex: 4,
        resultCount: -2,
      })
    ).toEqual({
      resultIndex: 4,
      resultCount: 0,
      hasSearched: true,
    });
  });

  it('uses the total result count when the active result index is unavailable', () => {
    expect(
      getTerminalSearchStatusLabel('agent', {
        resultIndex: -1,
        resultCount: 5,
        hasSearched: true,
      })
    ).toBe('5/5');
  });

  it('caps the active result position at the total result count', () => {
    expect(
      getTerminalSearchStatusLabel('agent', {
        resultIndex: 7,
        resultCount: 5,
        hasSearched: true,
      })
    ).toBe('5/5');
  });

  it('builds terminal search decorations from the active theme tokens', () => {
    expect(
      buildTerminalSearchDecorations({
        selectionBackground: '#101010',
        blue: '#2244ff',
        brightBlue: '#88aaff',
        yellow: '#ffcc00',
        brightYellow: '#ffe680',
      })
    ).toEqual({
      matchBackground: '#101010',
      matchBorder: '#2244ff',
      matchOverviewRuler: '#2244ff',
      activeMatchBackground: '#ffcc00',
      activeMatchBorder: '#ffe680',
      activeMatchColorOverviewRuler: '#ffe680',
    });
  });
});
