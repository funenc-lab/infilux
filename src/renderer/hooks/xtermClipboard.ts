import type { Terminal } from '@xterm/xterm';

type TerminalSelectionReader = Pick<Terminal, 'getSelection' | 'hasSelection'>;

export function getTerminalSelectionText(terminal: TerminalSelectionReader | null): string | null {
  if (!terminal?.hasSelection()) {
    return null;
  }

  const selection = terminal.getSelection();
  return selection.length > 0 ? selection : null;
}

export function shouldHandleTerminalCopyEvent({
  container,
  eventTarget,
  activeElement,
  domSelectionText,
  selectionText,
}: {
  container: HTMLElement | null;
  eventTarget: EventTarget | null;
  activeElement: EventTarget | null;
  domSelectionText: string;
  selectionText: string | null;
}): boolean {
  if (!container || !selectionText) {
    return false;
  }

  if (
    typeof eventTarget === 'object' &&
    eventTarget !== null &&
    container.contains(eventTarget as Node)
  ) {
    return true;
  }

  if (
    typeof activeElement === 'object' &&
    activeElement !== null &&
    container.contains(activeElement as Node)
  ) {
    return true;
  }

  const activeTagName =
    typeof activeElement === 'object' &&
    activeElement !== null &&
    'tagName' in activeElement &&
    typeof activeElement.tagName === 'string'
      ? activeElement.tagName.toUpperCase()
      : null;
  const activeElementIsEditable =
    activeTagName === 'INPUT' ||
    activeTagName === 'TEXTAREA' ||
    (typeof activeElement === 'object' &&
      activeElement !== null &&
      'isContentEditable' in activeElement &&
      activeElement.isContentEditable === true);

  if (activeElementIsEditable) {
    return false;
  }

  if (domSelectionText.trim().length > 0) {
    return false;
  }

  return true;
}

export async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard write is unavailable');
  }

  await navigator.clipboard.writeText(text);
}

export async function readClipboardText(): Promise<string> {
  if (!navigator.clipboard?.readText) {
    throw new Error('Clipboard read is unavailable');
  }

  return await navigator.clipboard.readText();
}

export async function copyTerminalSelectionToClipboard(
  terminal: TerminalSelectionReader | null
): Promise<boolean> {
  const selectionText = getTerminalSelectionText(terminal);
  if (!selectionText) {
    return false;
  }

  await writeClipboardText(selectionText);
  return true;
}
