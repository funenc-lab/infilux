const ESC = String.raw`\u001b`;
const BEL = String.raw`\u0007`;

const ANSI_CSI_REGEX = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g');
const ANSI_INCOMPLETE_CSI_REGEX = new RegExp(`${ESC}\\[[0-?]*[ -/]*$`, 'g');
const ANSI_OSC_REGEX = new RegExp(`${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\|$)`, 'g');
const ANSI_STRING_SEQUENCE_REGEX = new RegExp(`${ESC}[P_X^][\\s\\S]*?(?:${ESC}\\\\|$)`, 'g');
const ANSI_SINGLE_ESCAPE_REGEX = new RegExp(`${ESC}[@-_]`, 'g');

const PROMPT_PATTERNS = [
  /^\s*[$>#]\s?$/,
  /^\s*PS [^>]+>\s?$/,
  /^\s*[\w.-]+@[\w.-]+.*[#$>]\s?$/,
  /^\s*[A-Za-z]:\\.*>\s?$/,
  /^\s*[❯➜]\s?.*$/,
];

export const DEFAULT_RECENT_AGENT_OUTPUT_LIMIT = 64 * 1024;

function stripTerminalControlSequences(value: string): string {
  return value
    .replace(ANSI_STRING_SEQUENCE_REGEX, '')
    .replace(ANSI_OSC_REGEX, '')
    .replace(ANSI_CSI_REGEX, '')
    .replace(ANSI_INCOMPLETE_CSI_REGEX, '')
    .replace(ANSI_SINGLE_ESCAPE_REGEX, '');
}

export function hasRenderableAgentTerminalOutput(rawOutput: string): boolean {
  const normalized = stripTerminalControlSequences(rawOutput).replace(/\r\n?/g, '\n');
  const printable = Array.from(normalized)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined &&
        (codePoint === 9 || codePoint === 10 || codePoint === 13 || codePoint > 31) &&
        codePoint !== 127
      );
    })
    .join('');
  return printable.trim().length > 0;
}

function isPromptLikeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  return PROMPT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function appendRecentAgentOutput(
  currentOutput: string,
  nextChunk: string,
  maxLength = DEFAULT_RECENT_AGENT_OUTPUT_LIMIT
): string {
  const nextOutput = `${currentOutput}${nextChunk}`;
  if (nextOutput.length <= maxLength) {
    return nextOutput;
  }

  return nextOutput.slice(-maxLength);
}

export function resolveCopyableAgentOutputBlock(rawOutput: string): string | null {
  const normalized = stripTerminalControlSequences(rawOutput).replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  while (lines.length > 0 && !lines[0]?.trim()) {
    lines.shift();
  }

  while (lines.length > 0 && !lines.at(-1)?.trim()) {
    lines.pop();
  }

  while (lines.length > 0 && isPromptLikeLine(lines.at(-1) ?? '')) {
    lines.pop();
    while (lines.length > 0 && !lines.at(-1)?.trim()) {
      lines.pop();
    }
  }

  const value = lines.join('\n').trim();
  return value ? value : null;
}
