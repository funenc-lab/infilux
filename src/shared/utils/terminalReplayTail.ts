import { takeUtf16Tail } from './utf16Tail';

const ESC = 0x1b;
const BEL = 0x07;
const CANCEL = 0x18;
const SUBSTITUTE = 0x1a;
const STRING_TERMINATOR = 0x9c;
const C1_DCS = 0x90;
const C1_CSI = 0x9b;
const C1_OSC = 0x9d;
const C1_SOS = 0x98;
const C1_PM = 0x9e;
const C1_APC = 0x9f;
const UTF8_ENCODER = new TextEncoder();

export type TerminalReplayParserState =
  | 'text'
  | 'escape'
  | 'escapeIntermediate'
  | 'csi'
  | 'osc'
  | 'string'
  | 'oscEscape'
  | 'stringEscape';

export interface TerminalReplayTailState {
  replay: string;
  initialParserState: TerminalReplayParserState;
}

function isStringIntroducer(codeUnit: number): boolean {
  return codeUnit === C1_DCS || codeUnit === C1_SOS || codeUnit === C1_PM || codeUnit === C1_APC;
}

function isControlCancellation(codeUnit: number): boolean {
  return codeUnit === CANCEL || codeUnit === SUBSTITUTE;
}

function isEscapeIntermediate(codeUnit: number): boolean {
  return codeUnit >= 0x20 && codeUnit <= 0x2f;
}

function resolveEscapeState(codeUnit: number): TerminalReplayParserState {
  if (isControlCancellation(codeUnit)) {
    return 'text';
  }

  if (codeUnit === ESC) {
    return 'escape';
  }

  if (codeUnit === 0x5b) {
    return 'csi';
  }

  if (codeUnit === 0x5d) {
    return 'osc';
  }

  if (codeUnit === 0x50 || codeUnit === 0x58 || codeUnit === 0x5e || codeUnit === 0x5f) {
    return 'string';
  }

  if (codeUnit === C1_CSI) {
    return 'csi';
  }

  if (codeUnit === C1_OSC) {
    return 'osc';
  }

  if (isStringIntroducer(codeUnit)) {
    return 'string';
  }

  if (isEscapeIntermediate(codeUnit)) {
    return 'escapeIntermediate';
  }

  return 'text';
}

export function advanceTerminalReplayParserState(
  state: TerminalReplayParserState,
  codeUnit: number
): TerminalReplayParserState {
  if (state === 'text') {
    if (codeUnit === ESC) {
      return 'escape';
    }
    if (codeUnit === C1_CSI) {
      return 'csi';
    }
    if (codeUnit === C1_OSC) {
      return 'osc';
    }
    return isStringIntroducer(codeUnit) ? 'string' : 'text';
  }

  if (state === 'escape') {
    return resolveEscapeState(codeUnit);
  }

  if (state === 'escapeIntermediate') {
    if (isControlCancellation(codeUnit)) {
      return 'text';
    }
    if (codeUnit === ESC) {
      return 'escape';
    }
    if (isEscapeIntermediate(codeUnit)) {
      return 'escapeIntermediate';
    }
    if (codeUnit === C1_CSI) {
      return 'csi';
    }
    if (codeUnit === C1_OSC) {
      return 'osc';
    }
    return isStringIntroducer(codeUnit) ? 'string' : 'text';
  }

  if (state === 'csi') {
    if (isControlCancellation(codeUnit)) {
      return 'text';
    }
    if (codeUnit === ESC) {
      return 'escape';
    }
    if (codeUnit >= 0x40 && codeUnit <= 0x7e) {
      return 'text';
    }
    if (codeUnit === C1_CSI) {
      return 'csi';
    }
    if (codeUnit === C1_OSC) {
      return 'osc';
    }
    return isStringIntroducer(codeUnit) ? 'string' : 'csi';
  }

  if (state === 'osc') {
    if (isControlCancellation(codeUnit)) {
      return 'text';
    }
    if (codeUnit === BEL || codeUnit === STRING_TERMINATOR) {
      return 'text';
    }
    return codeUnit === ESC ? 'oscEscape' : 'osc';
  }

  if (state === 'string') {
    if (isControlCancellation(codeUnit)) {
      return 'text';
    }
    if (codeUnit === STRING_TERMINATOR) {
      return 'text';
    }
    return codeUnit === ESC ? 'stringEscape' : 'string';
  }

  if (state === 'oscEscape') {
    if (isControlCancellation(codeUnit)) {
      return 'text';
    }
    if (codeUnit === 0x5c || codeUnit === BEL || codeUnit === STRING_TERMINATOR) {
      return 'text';
    }
    return codeUnit === ESC ? 'oscEscape' : 'osc';
  }

  if (isControlCancellation(codeUnit)) {
    return 'text';
  }
  if (codeUnit === 0x5c || codeUnit === STRING_TERMINATOR) {
    return 'text';
  }
  return codeUnit === ESC ? 'stringEscape' : 'string';
}

export function isTerminalReplayBoundary(state: TerminalReplayParserState): boolean {
  return state === 'text';
}

export function resolveTerminalReplayParserState(
  value: string,
  initialState: TerminalReplayParserState = 'text'
): TerminalReplayParserState {
  let state = initialState;

  for (let index = 0; index < value.length; index += 1) {
    state = advanceTerminalReplayParserState(state, value.charCodeAt(index));
  }

  return state;
}

export function takeTerminalReplayTail(
  value: string,
  maxCodeUnits: number,
  initialState: TerminalReplayParserState = 'text'
): string {
  const utf16SafeTail = takeUtf16Tail(value, maxCodeUnits);
  if (
    !utf16SafeTail ||
    (utf16SafeTail.length === value.length && isTerminalReplayBoundary(initialState))
  ) {
    return utf16SafeTail;
  }

  const requestedStart = value.length - utf16SafeTail.length;
  let safeStart = requestedStart;
  let state = initialState;

  for (let index = 0; index < requestedStart; index += 1) {
    state = advanceTerminalReplayParserState(state, value.charCodeAt(index));
  }

  while (!isTerminalReplayBoundary(state) && safeStart < value.length) {
    state = advanceTerminalReplayParserState(state, value.charCodeAt(safeStart));
    safeStart += 1;
  }

  return value.slice(safeStart);
}

function getPreviousCodePointStart(value: string, endOffset: number): number {
  const previousCodeUnit = value.charCodeAt(endOffset - 1);
  if (previousCodeUnit >= 0xdc00 && previousCodeUnit <= 0xdfff && endOffset >= 2) {
    const leadingCodeUnit = value.charCodeAt(endOffset - 2);
    if (leadingCodeUnit >= 0xd800 && leadingCodeUnit <= 0xdbff) {
      return endOffset - 2;
    }
  }

  return endOffset - 1;
}

function takeUtf8ByteTail(value: string, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !value) {
    return '';
  }

  let retainedBytes = 0;
  let startOffset = value.length;
  while (startOffset > 0) {
    const nextStartOffset = getPreviousCodePointStart(value, startOffset);
    const byteLength = UTF8_ENCODER.encode(value.slice(nextStartOffset, startOffset)).byteLength;
    if (retainedBytes + byteLength > maxBytes) {
      break;
    }

    retainedBytes += byteLength;
    startOffset = nextStartOffset;
  }

  return value.slice(startOffset);
}

export function takeTerminalReplayByteTail(
  value: string,
  maxBytes: number,
  initialState: TerminalReplayParserState = 'text'
): string {
  const utf8SafeTail = takeUtf8ByteTail(value, maxBytes);
  if (!utf8SafeTail) {
    return '';
  }

  const requestedStart = value.length - utf8SafeTail.length;
  const stateAtTailStart = resolveTerminalReplayParserState(
    value.slice(0, requestedStart),
    initialState
  );
  return takeTerminalReplayTail(utf8SafeTail, utf8SafeTail.length, stateAtTailStart);
}

export function appendTerminalReplayTail(
  current: TerminalReplayTailState,
  chunk: string,
  maxCodeUnits: number
): TerminalReplayTailState {
  if (!chunk) {
    return current;
  }

  const combined = `${current.replay}${chunk}`;
  const replay = takeTerminalReplayTail(combined, maxCodeUnits, current.initialParserState);
  if (replay) {
    return {
      replay,
      initialParserState: 'text',
    };
  }

  return {
    replay: '',
    initialParserState: resolveTerminalReplayParserState(combined, current.initialParserState),
  };
}
