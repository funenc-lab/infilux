import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const emojiPickerSource = readFileSync(resolve(currentDir, '../EmojiPicker.tsx'), 'utf8');

describe('EmojiPicker control style policy', () => {
  it('uses shared control button classes for trigger and clear actions', () => {
    expect(emojiPickerSource).toContain('EMOJI_PICKER_TRIGGER_CLASS_NAME');
    expect(emojiPickerSource).toContain(
      "'control-action-button control-action-button-secondary flex h-9 items-center gap-2 rounded-md px-3 text-sm'"
    );
    expect(emojiPickerSource).toContain('EMOJI_PICKER_CLEAR_BUTTON_CLASS_NAME');
    expect(emojiPickerSource).toContain(
      "'control-icon-button flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground'"
    );
  });

  it('removes local accent hover overrides from emoji picker controls', () => {
    expect(emojiPickerSource).not.toContain('hover:bg-accent/50');
  });
});
