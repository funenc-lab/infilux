import { beforeEach, describe, expect, it } from 'vitest';
import { useNavigationStore } from '../../../stores/navigation';

describe('useNavigationStore', () => {
  beforeEach(() => {
    useNavigationStore.setState({ pendingNavigation: null });
  });

  it('stores a pending file navigation request with preview metadata', () => {
    useNavigationStore.getState().navigateToFile({
      path: '/repo-a/src/App.tsx',
      line: 42,
      column: 7,
      previewMode: 'fullscreen',
    });

    expect(useNavigationStore.getState().pendingNavigation).toEqual({
      path: '/repo-a/src/App.tsx',
      line: 42,
      column: 7,
      previewMode: 'fullscreen',
    });
  });

  it('replaces an older navigation request and clears it after handling', () => {
    const store = useNavigationStore.getState();

    store.navigateToFile({ path: '/repo-a/old.ts', line: 1 });
    store.navigateToFile({ path: '/repo-a/new.ts', line: 9, column: 3, previewMode: 'split' });

    expect(useNavigationStore.getState().pendingNavigation).toEqual({
      path: '/repo-a/new.ts',
      line: 9,
      column: 3,
      previewMode: 'split',
    });

    store.clearNavigation();
    expect(useNavigationStore.getState().pendingNavigation).toBeNull();
  });
});
