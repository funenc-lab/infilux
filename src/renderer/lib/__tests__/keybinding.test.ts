import { describe, expect, it } from 'vitest';
import type { TerminalKeybinding } from '@/stores/settings';
import { codeToKey, getKeyFromEvent, matchesKeybinding } from '../keybinding';

function createKeyboardEvent(
  overrides: Partial<KeyboardEvent> & Pick<KeyboardEvent, 'code' | 'key'>
): KeyboardEvent {
  return {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe('keybinding', () => {
  it('maps key codes into normalized key names', () => {
    expect(codeToKey('Digit7')).toBe('7');
    expect(codeToKey('KeyK')).toBe('k');
    expect(codeToKey('F12')).toBe('F12');
    expect(codeToKey('BracketLeft')).toBe('[');
    expect(codeToKey('Space')).toBe('space');
    expect(codeToKey('ArrowRight')).toBe('arrowright');
    expect(codeToKey('UnknownKey')).toBeNull();
  });

  it('prefers code-derived keys and falls back to the event key', () => {
    expect(getKeyFromEvent(createKeyboardEvent({ code: 'KeyP', key: 'π' }))).toBe('p');
    expect(getKeyFromEvent(createKeyboardEvent({ code: 'UnknownKey', key: 'Ω' }))).toBe('ω');
  });

  it('matches keyboard events against all modifier combinations', () => {
    const binding: TerminalKeybinding = {
      key: 'k',
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
    };

    expect(
      matchesKeybinding(
        createKeyboardEvent({
          code: 'KeyK',
          key: 'k',
          ctrlKey: true,
          shiftKey: true,
        }),
        binding
      )
    ).toBe(true);

    expect(
      matchesKeybinding(
        createKeyboardEvent({
          code: 'KeyK',
          key: 'k',
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
        }),
        binding
      )
    ).toBe(false);

    expect(
      matchesKeybinding(
        createKeyboardEvent({
          code: 'KeyL',
          key: 'l',
          ctrlKey: true,
          shiftKey: true,
        }),
        binding
      )
    ).toBe(false);

    expect(
      matchesKeybinding(
        createKeyboardEvent({
          code: 'KeyP',
          key: 'p',
        }),
        { key: 'p' }
      )
    ).toBe(true);

    expect(
      matchesKeybinding(
        createKeyboardEvent({
          code: 'KeyM',
          key: 'm',
          altKey: true,
          metaKey: true,
        }),
        { key: 'm', alt: true, meta: true }
      )
    ).toBe(true);
  });
});
