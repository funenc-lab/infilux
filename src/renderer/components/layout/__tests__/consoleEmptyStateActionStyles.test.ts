import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

describe('Console empty state action styles', () => {
  it('uses shared console action button classes in the editor empty state', () => {
    expect(editorAreaSource).toContain('control-action-button');
    expect(editorAreaSource).toContain('control-action-button-primary');
    expect(editorAreaSource).toContain('variant="default"');
  });

  it('uses shared console action button classes in the source control empty state', () => {
    expect(sourceControlPanelSource).toContain('control-action-button');
    expect(sourceControlPanelSource).toContain('control-action-button-primary');
    expect(sourceControlPanelSource).toContain('variant="default"');
  });

  it('uses shared console action button classes in the terminal empty states', () => {
    expect(terminalPanelSource).toContain('control-action-button');
    expect(terminalPanelSource).toContain('control-action-button-primary');
    expect(terminalPanelSource).toContain('variant="default"');
  });

  it('uses shared console action button classes in the file panel empty states', () => {
    expect(filePanelSource).toContain('control-action-button');
    expect(filePanelSource).toContain('control-action-button-primary');
    expect(filePanelSource).toContain('variant="default"');
    expect(currentFilePanelSource).toContain('control-action-button');
    expect(currentFilePanelSource).toContain('control-action-button-primary');
    expect(currentFilePanelSource).toContain('variant="default"');
  });
});
