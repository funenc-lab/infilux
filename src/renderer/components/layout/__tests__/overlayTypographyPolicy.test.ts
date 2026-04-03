import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dialogSource = readFileSync(resolve(currentDir, '../../ui/dialog.tsx'), 'utf8');
const popoverSource = readFileSync(resolve(currentDir, '../../ui/popover.tsx'), 'utf8');
const settingsDialogSource = readFileSync(
  resolve(currentDir, '../../settings/SettingsDialog.tsx'),
  'utf8'
);
const draggableSettingsWindowSource = readFileSync(
  resolve(currentDir, '../../settings/DraggableSettingsWindow.tsx'),
  'utf8'
);
const runningProjectsPopoverSource = readFileSync(
  resolve(currentDir, '../RunningProjectsPopover.tsx'),
  'utf8'
);
const appResourceManagerDrawerSource = readFileSync(
  resolve(currentDir, '../AppResourceManagerDrawer.tsx'),
  'utf8'
);
const appResourceStatusPopoverSource = readFileSync(
  resolve(currentDir, '../AppResourceStatusPopover.tsx'),
  'utf8'
);
const actionPanelSource = readFileSync(resolve(currentDir, '../ActionPanel.tsx'), 'utf8');
const cloneTasksPopoverSource = readFileSync(
  resolve(currentDir, '../../git/CloneTasksPopover.tsx'),
  'utf8'
);
const mergeWorktreeDialogSource = readFileSync(
  resolve(currentDir, '../../worktree/MergeWorktreeDialog.tsx'),
  'utf8'
);
const pluginBrowserDialogSource = readFileSync(
  resolve(currentDir, '../../settings/plugins/PluginBrowserDialog.tsx'),
  'utf8'
);
const marketplacesDialogSource = readFileSync(
  resolve(currentDir, '../../settings/plugins/MarketplacesDialog.tsx'),
  'utf8'
);
const pluginsSectionSource = readFileSync(
  resolve(currentDir, '../../settings/plugins/PluginsSection.tsx'),
  'utf8'
);
const mcpServerDialogSource = readFileSync(
  resolve(currentDir, '../../settings/mcp/McpServerDialog.tsx'),
  'utf8'
);
const promptEditorDialogSource = readFileSync(
  resolve(currentDir, '../../settings/prompts/PromptEditorDialog.tsx'),
  'utf8'
);
const providerDialogSource = readFileSync(
  resolve(currentDir, '../../settings/claude-provider/ProviderDialog.tsx'),
  'utf8'
);
const providerListSource = readFileSync(
  resolve(currentDir, '../../settings/claude-provider/ProviderList.tsx'),
  'utf8'
);

describe('overlay typography policy', () => {
  it('uses semantic typography classes in dialog and popover primitives', () => {
    expect(dialogSource).toContain('ui-type-panel-title');
    expect(dialogSource).toContain('ui-type-panel-description');
    expect(popoverSource).toContain('ui-type-panel-title');
    expect(popoverSource).toContain('ui-type-panel-description');
  });

  it('uses semantic typography classes in settings overlays and picker surfaces', () => {
    expect(settingsDialogSource).toContain('ui-type-panel-title');
    expect(draggableSettingsWindowSource).toContain('ui-type-panel-title');
    expect(runningProjectsPopoverSource).toContain('ui-type-panel-description');
    expect(appResourceManagerDrawerSource).toContain('ui-type-panel-description');
    expect(actionPanelSource).toContain('ui-type-panel-description');
    expect(runningProjectsPopoverSource).toContain('ui-type-meta');
    expect(appResourceManagerDrawerSource).toContain('ui-type-meta');
    expect(appResourceManagerDrawerSource).toContain('ui-type-block-title');
    expect(appResourceStatusPopoverSource).toContain('sr-only ui-type-panel-description');
    expect(appResourceStatusPopoverSource).toContain('sr-only ui-type-meta');
    expect(cloneTasksPopoverSource).toContain('ui-type-panel-title');
    expect(cloneTasksPopoverSource).toContain('ui-type-block-title');
    expect(cloneTasksPopoverSource).toContain('ui-type-meta');
    expect(mergeWorktreeDialogSource).toContain('ui-type-panel-description');
    expect(mergeWorktreeDialogSource).toContain('ui-type-block-title');
    expect(mergeWorktreeDialogSource).toContain('ui-type-meta');
    expect(pluginBrowserDialogSource).toContain('ui-type-panel-description');
    expect(pluginBrowserDialogSource).toContain('text-center text-muted-foreground');
    expect(pluginBrowserDialogSource).toContain('ui-type-meta');
    expect(marketplacesDialogSource).toContain('ui-type-panel-description');
    expect(marketplacesDialogSource).toContain('text-center text-muted-foreground');
    expect(marketplacesDialogSource).toContain('ui-type-meta');
    expect(pluginsSectionSource).toContain('ui-type-panel-description');
    expect(pluginsSectionSource).toContain('text-center text-muted-foreground');
    expect(pluginBrowserDialogSource).toContain('ui-type-block-title');
    expect(marketplacesDialogSource).toContain('ui-type-block-title');
    expect(mcpServerDialogSource).toContain('ui-type-panel-description');
    expect(mcpServerDialogSource).toContain('ui-type-meta');
    expect(promptEditorDialogSource).toContain('ui-type-panel-description');
    expect(promptEditorDialogSource).toContain('ui-type-meta');
    expect(providerDialogSource).toContain('ui-type-panel-description');
    expect(providerListSource).toContain('ui-type-block-title');
  });
});
