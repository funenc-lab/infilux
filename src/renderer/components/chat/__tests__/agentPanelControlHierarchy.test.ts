import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelComponentSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');
const sessionBarSource = [
  readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8'),
  readFileSync(resolve(currentDir, '../controlButtonStyles.ts'), 'utf8'),
].join('\n');
const enhancedInputSource = readFileSync(resolve(currentDir, '../EnhancedInput.tsx'), 'utf8');

describe('Agent panel control hierarchy', () => {
  it('keeps the conversation surface free of a duplicated top summary block', () => {
    expect(agentPanelComponentSource).not.toContain('AgentPanelContext');
    expect(agentPanelComponentSource).not.toContain(
      "t('Start {{agent}} now or choose another profile'"
    );
  });

  it('uses differentiated button classes for primary, active, and tab states', () => {
    expect(sessionBarSource).toContain('SESSION_BAR_SPLIT_ACTION_BUTTON_CLASS_NAME');
    expect(sessionBarSource).toContain('SESSION_BAR_TOOLBAR_BUTTON_CLASS_NAME');
    expect(sessionBarSource).toContain('control-icon-button-primary');
    expect(sessionBarSource).toContain('control-icon-button-active');
    expect(sessionBarSource).toContain('control-session-tab');
  });

  it('treats the composer send action as primary and utility actions as secondary', () => {
    expect(enhancedInputSource).toContain('control-input-action');
    expect(enhancedInputSource).toContain('control-input-action-primary');
    expect(enhancedInputSource).toContain('control-input-action-secondary');
  });
});
