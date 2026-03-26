import { describe, expect, it } from 'vitest';
import {
  createInitialFilePanelTrackingState,
  createInitialFileSidebarTrackingState,
} from '../fileTreeTrackingState';

describe('createInitialFileSidebarTrackingState', () => {
  it('starts from an uninitialized sidebar state so the first file tab activation can expand it', () => {
    expect(createInitialFileSidebarTrackingState()).toEqual({
      activeTab: null,
      worktreePath: null,
      activeFilePath: null,
    });
  });
});

describe('createInitialFilePanelTrackingState', () => {
  it('starts from an inactive panel state so the first visible file panel can restore the tree', () => {
    expect(createInitialFilePanelTrackingState()).toEqual({
      isActive: false,
      rootPath: undefined,
      activeFilePath: null,
    });
  });
});
