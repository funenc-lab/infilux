interface RetainedEditorRuntimeOptions {
  isPanelActive: boolean;
  openTabCount: number;
}

interface RetainedEditorRuntimeState {
  shouldLoadEditor: boolean;
  runtimeEffectsEnabled: boolean;
}

interface FilePanelRefreshTargetOptions {
  isPanelActive: boolean;
  isWindowFocused: boolean;
  wasWindowFocused: boolean;
  activeTabPath: string | null;
}

export function resolveRetainedEditorRuntime(
  options: RetainedEditorRuntimeOptions
): RetainedEditorRuntimeState {
  const shouldLoadEditor = options.isPanelActive || options.openTabCount > 0;

  return {
    shouldLoadEditor,
    runtimeEffectsEnabled: options.isPanelActive && shouldLoadEditor,
  };
}

export function getFilePanelRefreshTargetOnWindowFocus(
  options: FilePanelRefreshTargetOptions
): string | null {
  if (!options.isPanelActive || !options.isWindowFocused || options.wasWindowFocused) {
    return null;
  }

  return options.activeTabPath;
}
