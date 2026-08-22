interface XtermInputForwardingOptions {
  isApplyingBackendOutput: boolean;
}

const ESC = '\x1b';
const BEL = '\x07';
const CSI = '\x9b';
const DCS = '\x90';
const OSC = '\x9d';
const ST = '\x9c';

function isControlSequenceFinal(code: number): boolean {
  return code >= 0x40 && code <= 0x7e;
}

function consumeCsiTerminalResponse(data: string, start: number): number | null {
  const parameterStart = data[start] === CSI ? start + 1 : start + 2;
  let index = parameterStart;

  while (index < data.length) {
    const code = data.charCodeAt(index);
    if (!isControlSequenceFinal(code)) {
      index += 1;
      continue;
    }

    const final = data[index];
    const sequence = data.slice(parameterStart, index + 1);
    const isReport =
      final === 'c' ||
      final === 'n' ||
      final === 'R' ||
      final === 't' ||
      sequence.endsWith('$y') ||
      (final === 'u' && sequence.startsWith('?'));
    return isReport ? index + 1 : null;
  }

  return null;
}

function consumeStringTerminatedSequence(
  data: string,
  start: number,
  acceptsBellTerminator: boolean
): number | null {
  const contentStart = data[start] === ESC ? start + 2 : start + 1;

  for (let index = contentStart; index < data.length; index += 1) {
    if (acceptsBellTerminator && data[index] === BEL) {
      return index + 1;
    }
    if (data[index] === ST) {
      return index + 1;
    }
    if (data[index] === ESC && data[index + 1] === '\\') {
      return index + 2;
    }
  }

  return null;
}

function isTerminalProtocolResponse(data: string): boolean {
  if (!data) {
    return false;
  }

  let index = 0;
  while (index < data.length) {
    const current = data[index];
    let next: number | null = null;

    if (current === CSI || (current === ESC && data[index + 1] === '[')) {
      next = consumeCsiTerminalResponse(data, index);
    } else if (current === DCS || (current === ESC && data[index + 1] === 'P')) {
      next = consumeStringTerminatedSequence(data, index, false);
    } else if (current === OSC || (current === ESC && data[index + 1] === ']')) {
      next = consumeStringTerminatedSequence(data, index, true);
    }

    if (next === null) {
      return false;
    }
    index = next;
  }

  return true;
}

export function shouldForwardXtermInput(
  data: string,
  { isApplyingBackendOutput }: XtermInputForwardingOptions
): boolean {
  return !isApplyingBackendOutput || !isTerminalProtocolResponse(data);
}
