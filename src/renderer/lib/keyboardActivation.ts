export interface KeyboardActivationEvent {
  currentTarget: EventTarget | null;
  defaultPrevented: boolean;
  key: string;
  preventDefault: () => void;
  target: EventTarget | null;
}

export function handleKeyboardActivation(
  event: KeyboardActivationEvent,
  onActivate: () => void
): boolean {
  if (
    event.defaultPrevented ||
    event.currentTarget !== event.target ||
    (event.key !== 'Enter' && event.key !== ' ')
  ) {
    return false;
  }

  event.preventDefault();
  onActivate();
  return true;
}
