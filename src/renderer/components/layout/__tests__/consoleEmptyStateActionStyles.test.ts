import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mainContentSource } from './mainContentSource';

const currentDir = dirname(fileURLToPath(import.meta.url));
const editorAreaSource = readFileSync(resolve(currentDir, '../../files/EditorArea.tsx'), 'utf8');
const sourceControlPanelSource = readFileSync(
  resolve(currentDir, '../../source-control/SourceControlPanel.tsx'),
  'utf8'
);
const terminalPanelSource = readFileSync(
  resolve(currentDir, '../../terminal/TerminalPanel.tsx'),
  'utf8'
);
const filePanelSource = readFileSync(resolve(currentDir, '../../files/FilePanel.tsx'), 'utf8');
const currentFilePanelSource = readFileSync(
  resolve(currentDir, '../../files/CurrentFilePanel.tsx'),
  'utf8'
);
const terminalGroupSource = readFileSync(
  resolve(currentDir, '../../terminal/TerminalGroup.tsx'),
  'utf8'
);

describe('Console empty state action styles', () => {
  it('uses the shared control-state action button in the editor empty state', () => {
    expect(editorAreaSource).toContain('ControlStateActionButton');
  });

  it('uses the shared control-state action button in the main chat and source control idle states', () => {
    expect(mainContentSource).toContain('ControlStateActionButton');
    expect(sourceControlPanelSource).toContain('ControlStateActionButton');
  });

  it('uses the shared control-state action button in the terminal empty states', () => {
    expect(terminalPanelSource).toContain('ControlStateActionButton');
    expect(terminalGroupSource).toContain('ControlStateActionButton');
  });

  it('uses the shared control-state action button in the file panel empty states', () => {
    expect(filePanelSource).toContain('ControlStateActionButton');
    expect(currentFilePanelSource).toContain('ControlStateActionButton');
  });
});
