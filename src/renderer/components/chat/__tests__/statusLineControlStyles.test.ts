import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const statusLineSource = [
  readFileSync(resolve(currentDir, '../StatusLine.tsx'), 'utf8'),
  readFileSync(resolve(currentDir, '../controlButtonStyles.ts'), 'utf8'),
].join('\n');
const controlButtonStylesSource = readFileSync(
  resolve(currentDir, '../controlButtonStyles.ts'),
  'utf8'
);

describe('StatusLine control styles', () => {
  it('uses shared control-style helpers for path triggers, menu items, and rollover actions', () => {
    expect(statusLineSource).toContain("from './controlButtonStyles'");
    expect(statusLineSource).toContain('STATUS_LINE_DIR_TRIGGER_CLASS_NAME');
    expect(statusLineSource).toContain('STATUS_LINE_MENU_ITEM_CLASS_NAME');
    expect(statusLineSource).toContain('STATUS_LINE_ALERT_ACTION_CLASS_NAME');
    expect(statusLineSource).toContain('CHAT_PANEL_TRIGGER_CLASS_NAME');
    expect(statusLineSource).toContain('CHAT_MENU_ITEM_BASE_CLASS_NAME');
    expect(statusLineSource).toContain('CHAT_ACTION_BUTTON_SECONDARY_CLASS_NAME');
  });

  it('avoids one-off accent hover classes for StatusLine interactive controls', () => {
    expect(statusLineSource).not.toContain('hover:bg-accent/50');
    expect(statusLineSource).toContain('CHAT_PANEL_TRIGGER_CLASS_NAME');
    expect(statusLineSource).toContain('CHAT_MENU_ITEM_BASE_CLASS_NAME');
    expect(statusLineSource).toContain('CHAT_ACTION_BUTTON_SECONDARY_CLASS_NAME');
    expect(controlButtonStylesSource).toContain('control-panel-muted');
    expect(controlButtonStylesSource).toContain('control-menu-item');
    expect(controlButtonStylesSource).toContain('control-action-button-secondary');
  });
});
