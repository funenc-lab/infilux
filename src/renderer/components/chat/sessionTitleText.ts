const SESSION_TITLE_PROMPT_PREFIX = /^(?:[›❯»→➜>]+)\s+/u;

export function normalizeSessionTitleText(text: string): string {
  const normalizedWhitespace = text.replace(/\s+/g, ' ').trim();
  if (!normalizedWhitespace) return '';

  return normalizedWhitespace.replace(SESSION_TITLE_PROMPT_PREFIX, '').trim();
}
