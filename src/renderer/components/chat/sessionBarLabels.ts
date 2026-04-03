import { normalizeSessionTitleText } from './sessionTitleText';

export interface SessionBarLabelInput {
  terminalTitle?: string;
  name: string;
  userRenamed?: boolean;
}

export function getSessionDisplayName(session: SessionBarLabelInput): string {
  if (session.userRenamed) return normalizeSessionTitleText(session.name);

  const title = session.terminalTitle;
  if (!title) return normalizeSessionTitleText(session.name);

  if (/[/\\](pwsh|powershell|cmd|bash|zsh|sh|fish|nu|wsl)(\.exe)?["']?\s*$/i.test(title)) {
    return normalizeSessionTitleText(session.name);
  }

  if (/^(Administrator|root)\s*:/i.test(title)) {
    return normalizeSessionTitleText(session.name);
  }

  if (/^(npm|npx|node|python|py|pnpm|yarn|bun|deno|cargo|go|java|ruby)\s/i.test(title)) {
    return normalizeSessionTitleText(session.name);
  }

  return normalizeSessionTitleText(title);
}

export function getSessionHoverTitle(session: SessionBarLabelInput): string {
  const title = session.terminalTitle?.trim();
  if (!title) return normalizeSessionTitleText(session.name);

  return getSessionDisplayName({
    ...session,
    terminalTitle: title,
  });
}
