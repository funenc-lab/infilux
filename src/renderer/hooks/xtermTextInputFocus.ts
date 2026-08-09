import type { Terminal } from '@xterm/xterm';

const XTERM_TEXTAREA_SELECTOR =
  'textarea.xterm-helper-textarea, textarea[aria-label="Terminal input"], textarea';

function isHtmlTextarea(value: unknown): value is HTMLTextAreaElement {
  return value instanceof HTMLTextAreaElement;
}

function resolveXtermTextarea(terminal: Terminal): HTMLTextAreaElement | null {
  const terminalWithTextarea = terminal as { textarea?: unknown };
  const textarea = terminalWithTextarea.textarea;
  if (isHtmlTextarea(textarea)) {
    return textarea;
  }

  const element = terminal.element;
  if (!element) {
    return null;
  }

  const candidate = element.querySelector(XTERM_TEXTAREA_SELECTOR);
  return isHtmlTextarea(candidate) ? candidate : null;
}

function prepareTextareaForIme(textarea: HTMLTextAreaElement): void {
  textarea.autocapitalize = 'off';
  textarea.autocomplete = 'off';
  textarea.spellcheck = false;
  textarea.inputMode = 'text';
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('data-infilux-xterm-ime-ready', 'true');
}

function focusWithoutScroll(textarea: HTMLTextAreaElement): void {
  textarea.focus({ preventScroll: true });
}

export function focusXtermTextInput(terminal: Terminal | null | undefined): void {
  if (!terminal) {
    return;
  }

  terminal.focus();

  const textarea = resolveXtermTextarea(terminal);
  if (!textarea || textarea.disabled) {
    return;
  }

  prepareTextareaForIme(textarea);
  if (textarea.ownerDocument.activeElement !== textarea) {
    focusWithoutScroll(textarea);
  }
}

export function installXtermImeFocusBridge(terminal: Terminal | null | undefined): {
  dispose: () => void;
} {
  if (!terminal) {
    return { dispose: () => undefined };
  }

  const textarea = resolveXtermTextarea(terminal);
  if (!textarea) {
    return { dispose: () => undefined };
  }

  const handleFocusIn = () => {
    prepareTextareaForIme(textarea);
  };

  prepareTextareaForIme(textarea);
  textarea.addEventListener('focusin', handleFocusIn);

  return {
    dispose: () => {
      textarea.removeEventListener('focusin', handleFocusIn);
    },
  };
}
