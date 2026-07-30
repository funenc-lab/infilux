const SESSION_TITLE_PROMPT_PREFIX = /^(?:[›❯»→➜>]+)\s*/u;

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

  return normalizedWhitespace.replace(SESSION_TITLE_PROMPT_PREFIX, '').trim();
}
