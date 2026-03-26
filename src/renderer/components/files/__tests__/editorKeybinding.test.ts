import { describe, expect, it } from 'vitest';
import type { TerminalKeybinding } from '@/stores/settings';
import { bindingToMonacoChord } from '../editorKeybinding';

const monacoStub = {
  KeyMod: {
    WinCtrl: 1 << 8,
    CtrlCmd: 1 << 9,
    Shift: 1 << 10,
    Alt: 1 << 11,
  },
  KeyCode: {
    KeyP: 80,
    F7: 118,
    Digit4: 52,
    Slash: 191,
  },
};

describe('editorKeybinding', () => {
  it('maps letter bindings with modifier chords', () => {
    const binding: TerminalKeybinding = { key: 'p', meta: true, shift: true };

    expect(bindingToMonacoChord(binding, monacoStub)).toBe(
      monacoStub.KeyMod.CtrlCmd | monacoStub.KeyMod.Shift | monacoStub.KeyCode.KeyP
    );
  });

  it('maps function, digit, and special keys', () => {
    expect(bindingToMonacoChord({ key: 'F7' }, monacoStub)).toBe(monacoStub.KeyCode.F7);
    expect(bindingToMonacoChord({ key: '4', ctrl: true }, monacoStub)).toBe(
      monacoStub.KeyMod.WinCtrl | monacoStub.KeyCode.Digit4
    );
    expect(bindingToMonacoChord({ key: '/' }, monacoStub)).toBe(monacoStub.KeyCode.Slash);
  });

  it('returns zero for unsupported or empty keys', () => {
    expect(bindingToMonacoChord({ key: '' }, monacoStub)).toBe(0);
    expect(bindingToMonacoChord({ key: 'unknown-key', alt: true }, monacoStub)).toBe(0);
  });
});
