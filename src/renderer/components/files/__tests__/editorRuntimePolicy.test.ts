import { describe, expect, it } from 'vitest';
import {
  getFilePanelRefreshTargetOnWindowFocus,
  resolveRetainedEditorRuntime,
} from '../editorRuntimePolicy';

describe('resolveRetainedEditorRuntime', () => {
  it('keeps retained editors mounted while disabling runtime effects for hidden panels', () => {
    expect(
      resolveRetainedEditorRuntime({
        isPanelActive: false,
        openTabCount: 2,
      })
    ).toEqual({
      shouldLoadEditor: true,
      runtimeEffectsEnabled: false,
    });
  });

  it('enables loading and runtime effects for the active panel', () => {
    expect(
      resolveRetainedEditorRuntime({
        isPanelActive: true,
        openTabCount: 0,
      })
    ).toEqual({
      shouldLoadEditor: true,
      runtimeEffectsEnabled: true,
    });
  });

  it('keeps empty hidden panels unloaded', () => {
    expect(
      resolveRetainedEditorRuntime({
        isPanelActive: false,
        openTabCount: 0,
      })
    ).toEqual({
      shouldLoadEditor: false,
      runtimeEffectsEnabled: false,
    });
  });
});

describe('getFilePanelRefreshTargetOnWindowFocus', () => {
  it('refreshes only when the active panel regains window focus', () => {
    expect(
      getFilePanelRefreshTargetOnWindowFocus({
        isPanelActive: true,
        isWindowFocused: true,
        wasWindowFocused: false,
        activeTabPath: '/repo/src/App.tsx',
      })
    ).toBe('/repo/src/App.tsx');
  });

  it('skips refresh for hidden retained panels', () => {
    expect(
      getFilePanelRefreshTargetOnWindowFocus({
        isPanelActive: false,
        isWindowFocused: true,
        wasWindowFocused: false,
        activeTabPath: '/repo/src/App.tsx',
      })
    ).toBeNull();
  });

  it('skips refresh when focus did not transition back to the window', () => {
    expect(
      getFilePanelRefreshTargetOnWindowFocus({
        isPanelActive: true,
        isWindowFocused: true,
        wasWindowFocused: true,
        activeTabPath: '/repo/src/App.tsx',
      })
    ).toBeNull();
  });
});
