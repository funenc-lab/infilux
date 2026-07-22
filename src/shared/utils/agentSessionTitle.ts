const SESSION_TITLE_PROMPT_PREFIX = /^(?:[›❯»→➜>]+)\s*/u;
const MAX_AGENT_SESSION_TITLE_CODE_POINTS = 160;

function isInvisibleAgentSessionTitleCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return true;
  }

  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x061c ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    codePoint === 0x2060 ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

export function normalizeAgentSessionTitleText(text: string): string {
  const normalizedWhitespace = Array.from(text)
    .filter((character) => !isInvisibleAgentSessionTitleCharacter(character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizedWhitespace) {
    return '';
  }

  const normalizedTitle = normalizedWhitespace.replace(SESSION_TITLE_PROMPT_PREFIX, '').trim();
  const codePoints = Array.from(normalizedTitle);
  if (codePoints.length <= MAX_AGENT_SESSION_TITLE_CODE_POINTS) {
    return normalizedTitle;
  }

  return `${codePoints
    .slice(0, MAX_AGENT_SESSION_TITLE_CODE_POINTS - 1)
    .join('')
    .trimEnd()}…`;
}
