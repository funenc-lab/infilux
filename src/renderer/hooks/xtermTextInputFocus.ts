import type { Terminal } from '@xterm/xterm';

const XTERM_TEXTAREA_SELECTOR =
  'textarea.xterm-helper-textarea, textarea[aria-label="Terminal input"], textarea';
const IME_PRIMER_SELECTOR = 'textarea[data-infilux-ime-primer="true"]';
const PROGRAMMATIC_XTERM_FOCUS_ATTRIBUTE = 'data-infilux-programmatic-xterm-focus';

interface FocusXtermTextInputOptions {
  forceImePrime?: boolean;
}

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

function applyImePrimerStyle(textarea: HTMLTextAreaElement): void {
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

function resolveImePrimer(document: Document): HTMLTextAreaElement | null {
  const existing = document.querySelector(IME_PRIMER_SELECTOR);
  if (isHtmlTextarea(existing)) {
    return existing;
  }

  if (!document.body) {
    return null;
  }

  const textarea = document.createElement('textarea');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.setAttribute('data-infilux-ime-primer', 'true');
  textarea.tabIndex = -1;
  applyImePrimerStyle(textarea);
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

export function focusXtermTextInput(
  terminal: Terminal | null | undefined,
  options: FocusXtermTextInputOptions = {}
): void {
  if (!terminal) {
    return;
  }

  terminal.focus();

  const textarea = resolveXtermTextarea(terminal);
  if (!textarea || textarea.disabled) {
    return;
  }

  prepareTextareaForIme(textarea);

  if (!options.forceImePrime && textarea.ownerDocument.activeElement === textarea) {
    return;
  }

  const primer = resolveImePrimer(textarea.ownerDocument);
  if (!primer || primer.disabled) {
    focusXtermTextareaWithoutRearmingBridge(textarea);
    return;
  }

  prepareTextareaForIme(primer);
  focusWithoutScroll(primer);

  requestDocumentAnimationFrame(textarea.ownerDocument, () => {
    if (textarea.disabled) {
      return;
    }

    terminal.focus();
    prepareTextareaForIme(textarea);
    focusXtermTextareaWithoutRearmingBridge(textarea);
  });
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

  let isRearmingImeFocus = false;
  const releaseRearmGuard = () => {
    requestDocumentAnimationFrame(textarea.ownerDocument, () => {
      isRearmingImeFocus = false;
    });
  };

  const handleFocusIn = () => {
    if (textarea.getAttribute(PROGRAMMATIC_XTERM_FOCUS_ATTRIBUTE) === 'true') {
      return;
    }

    if (isRearmingImeFocus) {
      return;
    }

    isRearmingImeFocus = true;
    focusXtermTextInput(terminal, { forceImePrime: true });
    releaseRearmGuard();
  };

  textarea.addEventListener('focusin', handleFocusIn);

  return {
    dispose: () => {
      textarea.removeEventListener('focusin', handleFocusIn);
    },
  };
}
