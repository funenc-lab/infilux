export function sanitizeRuntimeProfileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}
