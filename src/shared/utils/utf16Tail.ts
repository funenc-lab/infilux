function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

export function takeUtf16Tail(value: string, maxCodeUnits: number): string {
  if (!value || maxCodeUnits <= 0 || Number.isNaN(maxCodeUnits)) {
    return '';
  }

  if (maxCodeUnits === Number.POSITIVE_INFINITY || value.length <= maxCodeUnits) {
    return value;
  }

  const limit = Math.floor(maxCodeUnits);
  if (limit <= 0) {
    return '';
  }

  let start = value.length - limit;
  if (
    start > 0 &&
    isLowSurrogate(value.charCodeAt(start)) &&
    isHighSurrogate(value.charCodeAt(start - 1))
  ) {
    start += 1;
  }

  return value.slice(start);
}
