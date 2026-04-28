import type { ClaudeProvider } from '@shared/types';

export type ClaudeProviderMatchSnapshot = Partial<
  Pick<
    ClaudeProvider,
    | 'baseUrl'
    | 'authToken'
    | 'model'
    | 'smallFastModel'
    | 'defaultSonnetModel'
    | 'defaultOpusModel'
    | 'defaultHaikuModel'
  >
>;

const normalizeValue = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function isClaudeProviderMatch(
  provider: ClaudeProvider,
  current?: ClaudeProviderMatchSnapshot | null
): boolean {
  if (!current) return false;
  const baseUrl = normalizeValue(current.baseUrl);
  const authToken = normalizeValue(current.authToken);
  if (!baseUrl || !authToken) return false;

  // Match the stable provider identity fields only.
  // Ignore model shortcuts because users can change them during normal CLI usage.
  return (
    normalizeValue(provider.baseUrl) === baseUrl &&
    normalizeValue(provider.authToken) === authToken &&
    normalizeValue(provider.defaultSonnetModel) === normalizeValue(current.defaultSonnetModel) &&
    normalizeValue(provider.defaultOpusModel) === normalizeValue(current.defaultOpusModel) &&
    normalizeValue(provider.defaultHaikuModel) === normalizeValue(current.defaultHaikuModel)
  );
}

const PROVIDER_SWITCH_WINDOW_MS = 5000;
let pendingProviderSwitch: { provider: ClaudeProvider; timestamp: number } | null = null;

export function markClaudeProviderSwitch(provider: ClaudeProvider): void {
  pendingProviderSwitch = { provider, timestamp: Date.now() };
}

export function clearClaudeProviderSwitch(): void {
  pendingProviderSwitch = null;
}

export function consumeClaudeProviderSwitch(
  extracted?: ClaudeProviderMatchSnapshot | null
): boolean {
  if (!pendingProviderSwitch) return false;
  const { provider, timestamp } = pendingProviderSwitch;
  if (Date.now() - timestamp > PROVIDER_SWITCH_WINDOW_MS) {
    pendingProviderSwitch = null;
    return false;
  }
  if (!isClaudeProviderMatch(provider, extracted)) {
    return false;
  }
  pendingProviderSwitch = null;
  return true;
}
