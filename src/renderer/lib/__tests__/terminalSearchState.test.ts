import { describe, expect, it } from 'vitest';
import {
  createEmptyTerminalSearchState,
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
});
