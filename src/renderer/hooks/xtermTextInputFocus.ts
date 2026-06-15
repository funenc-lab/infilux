import type { Terminal } from '@xterm/xterm';

const XTERM_TEXTAREA_SELECTOR =
  'textarea.xterm-helper-textarea, textarea[aria-label="Terminal input"], textarea';
const XTERM_IME_REARM_ATTRIBUTE = 'data-infilux-xterm-ime-rearm';
const XTERM_IME_REARM_SELECTOR = `textarea[${XTERM_IME_REARM_ATTRIBUTE}="true"]`;
const XTERM_IME_REARMING_ATTRIBUTE = 'data-infilux-xterm-ime-rearming';
const PROGRAMMATIC_XTERM_FOCUS_ATTRIBUTE = 'data-infilux-programmatic-xterm-focus';

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

function applyImeRearmTextareaStyle(textarea: HTMLTextAreaElement): void {
  Object.assign(textarea.style, {
    border: '0',
    height: '1px',
    left: '0',
    opacity: '0',
    padding: '0',
    pointerEvents: 'none',
    position: 'fixed',
    resize: 'none',
    top: '0',
    width: '1px',
    zIndex: '-1',
  });
}

function removeExistingImeRearmTextareas(document: Document): void {
  document.querySelectorAll(XTERM_IME_REARM_SELECTOR).forEach((node) => {
    node.remove();
  });
}

function createImeRearmTextarea(document: Document): HTMLTextAreaElement | null {
  if (!document.body) {
    return null;
  }

  removeExistingImeRearmTextareas(document);

  const textarea = document.createElement('textarea');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.setAttribute(XTERM_IME_REARM_ATTRIBUTE, 'true');
  textarea.tabIndex = -1;
  applyImeRearmTextareaStyle(textarea);
  prepareTextareaForIme(textarea);
  document.body.appendChild(textarea);
  return textarea;
}

function focusWithoutScroll(textarea: HTMLTextAreaElement): void {
  textarea.focus({ preventScroll: true });
}

function focusXtermTextareaWithoutRearmingBridge(textarea: HTMLTextAreaElement): void {
  textarea.setAttribute(PROGRAMMATIC_XTERM_FOCUS_ATTRIBUTE, 'true');
  try {
    focusWithoutScroll(textarea);
  } finally {
    textarea.removeAttribute(PROGRAMMATIC_XTERM_FOCUS_ATTRIBUTE);
  }
}

function requestDocumentAnimationFrame(document: Document, callback: () => void): void {
  const requestFrame =
    document.defaultView?.requestAnimationFrame ?? globalThis.requestAnimationFrame;
  if (requestFrame) {
    requestFrame(callback);
    return;
  }

  globalThis.setTimeout(callback, 0);
}

function isRearmingIme(textarea: HTMLTextAreaElement): boolean {
  return textarea.getAttribute(XTERM_IME_REARMING_ATTRIBUTE) === 'true';
}

function rearmImeThenFocusXterm(terminal: Terminal, textarea: HTMLTextAreaElement): void {
  if (isRearmingIme(textarea)) {
    return;
  }

  const rearmTextarea = createImeRearmTextarea(textarea.ownerDocument);
  if (!rearmTextarea || rearmTextarea.disabled) {
    focusXtermTextareaWithoutRearmingBridge(textarea);
    return;
  }

  textarea.setAttribute(XTERM_IME_REARMING_ATTRIBUTE, 'true');
  focusWithoutScroll(rearmTextarea);

  requestDocumentAnimationFrame(textarea.ownerDocument, () => {
    try {
      if (!textarea.isConnected || textarea.disabled) {
        return;
      }

      terminal.focus();
      prepareTextareaForIme(textarea);
      focusXtermTextareaWithoutRearmingBridge(textarea);
    } finally {
      rearmTextarea.remove();
      textarea.removeAttribute(XTERM_IME_REARMING_ATTRIBUTE);
    }
  });
}

function hasPendingNativeInput(textarea: HTMLTextAreaElement): boolean {
  return textarea.value.length > 0;
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

  if (textarea.ownerDocument.activeElement === textarea && hasPendingNativeInput(textarea)) {
    return;
  }

  rearmImeThenFocusXterm(terminal, textarea);
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
    if (
      textarea.getAttribute(PROGRAMMATIC_XTERM_FOCUS_ATTRIBUTE) === 'true' ||
      isRearmingIme(textarea)
    ) {
      return;
    }

    prepareTextareaForIme(textarea);
    rearmImeThenFocusXterm(terminal, textarea);
  };

  textarea.addEventListener('focusin', handleFocusIn);

  return {
    dispose: () => {
      textarea.removeEventListener('focusin', handleFocusIn);
    },
  };
}
