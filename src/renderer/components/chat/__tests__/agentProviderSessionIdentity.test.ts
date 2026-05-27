import { describe, expect, it } from 'vitest';
import { resolvePersistentProviderSessionId } from '../agentProviderSessionIdentity';

describe('resolvePersistentProviderSessionId', () => {
  it('does not persist unresolved codex ui session ids as provider identities', () => {
    expect(
      resolvePersistentProviderSessionId({
        agentCommand: 'codex',
        uiSessionId: 'ui-session-1',
        providerSessionId: 'ui-session-1',
        hostSessionKey: 'infilux-ui-session-1',
        providerSessionIdentityValid: false,
      })
    ).toBeUndefined();
  });

  it('persists resolved codex provider identities when they are distinct from runtime ids', () => {
    expect(
      resolvePersistentProviderSessionId({
        agentCommand: 'codex',
        uiSessionId: 'ui-session-1',
        providerSessionId: 'codex-thread-1',
        hostSessionKey: 'infilux-ui-session-1',
        providerSessionIdentityValid: true,
      })
    ).toBe('codex-thread-1');
  });
});
