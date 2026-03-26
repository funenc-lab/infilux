import type { TerminalKeybinding } from '@/stores/settings';

type MonacoKeyModifierMap = {
  WinCtrl: number;
  CtrlCmd: number;
  Shift: number;
  Alt: number;
};

type MonacoKeyCodeMap = Record<string, number | string>;

type MonacoKeybindingApi = {
  KeyMod: MonacoKeyModifierMap;
  KeyCode: MonacoKeyCodeMap;
};

// Map from codeToKey() output to Monaco KeyCode property names.
const SPECIAL_KEY_MAP: Record<string, string> = {
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  "'": 'Quote',
  '`': 'Backquote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '\\': 'Backslash',
  '-': 'Minus',
  '=': 'Equal',
  space: 'Space',
  enter: 'Enter',
  escape: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  arrowup: 'UpArrow',
  arrowdown: 'DownArrow',
  arrowleft: 'LeftArrow',
  arrowright: 'RightArrow',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

// Convert a TerminalKeybinding to a Monaco editor chord number.
// Returns 0 if the key cannot be mapped.
export function bindingToMonacoChord(
  binding: TerminalKeybinding,
  monacoApi: MonacoKeybindingApi
): number {
  let chord = 0;
  if (binding.ctrl) chord |= monacoApi.KeyMod.WinCtrl;
  if (binding.meta) chord |= monacoApi.KeyMod.CtrlCmd;
  if (binding.shift) chord |= monacoApi.KeyMod.Shift;
  if (binding.alt) chord |= monacoApi.KeyMod.Alt;

  const key = binding.key.toLowerCase();
  if (!key) {
    return 0;
  }

  let keyCode: number | undefined;
  if (/^[a-z]$/.test(key)) {
    keyCode = monacoApi.KeyCode[
      `Key${key.toUpperCase()}` as keyof typeof monacoApi.KeyCode
    ] as number;
  } else if (/^f\d+$/.test(key)) {
    keyCode = monacoApi.KeyCode[key.toUpperCase() as keyof typeof monacoApi.KeyCode] as number;
  } else if (/^\d$/.test(key)) {
    keyCode = monacoApi.KeyCode[`Digit${key}` as keyof typeof monacoApi.KeyCode] as number;
  } else {
    const monacoName = SPECIAL_KEY_MAP[key];
    if (monacoName) {
      keyCode = monacoApi.KeyCode[monacoName as keyof typeof monacoApi.KeyCode] as number;
    }
  }

  if (keyCode === undefined || keyCode === 0) {
    return 0;
  }

  return chord | keyCode;
}
