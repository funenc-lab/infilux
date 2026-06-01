import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const IME_PROCESS_KEY_CODE = 229;

interface NativeImeKeyboardEvent {
  isComposing?: boolean;
  key?: string;
  keyCode?: number;
  which?: number;
}

export function isNativeImeCompositionKeyEvent(event: NativeImeKeyboardEvent): boolean {
  return (
    event.isComposing === true ||
    event.key === 'Process' ||
    event.keyCode === IME_PROCESS_KEY_CODE ||
    event.which === IME_PROCESS_KEY_CODE
  );
}

export function isReactImeCompositionKeyEvent(event: ReactKeyboardEvent): boolean {
  const nativeEvent = event.nativeEvent;
  return isNativeImeCompositionKeyEvent({
    isComposing: nativeEvent.isComposing,
    key: event.key || nativeEvent.key,
    keyCode: nativeEvent.keyCode,
    which: nativeEvent.which,
  });
}
