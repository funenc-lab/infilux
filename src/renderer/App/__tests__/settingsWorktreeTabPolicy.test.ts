import { describe, expect, it } from 'vitest';
import {
  resolveWorktreeTabForPersistence,
  resolveWorktreeTabForRestore,
} from '../settingsWorktreeTabPolicy';

describe('settingsWorktreeTabPolicy', () => {
  it('keeps the settings tab persisted when settings is shown as a tab', () => {
    expect(
      resolveWorktreeTabForPersistence({
        activeTab: 'settings',
        previousTab: 'terminal',
        settingsDisplayMode: 'tab',
      })
    ).toBe('settings');
  });

  it('persists the previous tab instead of settings when settings is shown as a draggable modal', () => {
    expect(
      resolveWorktreeTabForPersistence({
        activeTab: 'settings',
        previousTab: 'terminal',
        settingsDisplayMode: 'draggable-modal',
      })
    ).toBe('terminal');
  });

  it('falls back to chat when restoring a stale settings tab in draggable mode', () => {
    expect(
      resolveWorktreeTabForRestore({
        savedTab: 'settings',
        settingsDisplayMode: 'draggable-modal',
      })
    ).toBe('chat');
  });
});
