import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface TestClaudeGlobalPolicy {
  allowedCapabilityIds: string[];
  blockedCapabilityIds: string[];
  allowedSharedMcpIds: string[];
  blockedSharedMcpIds: string[];
  allowedPersonalMcpIds: string[];
  blockedPersonalMcpIds: string[];
  updatedAt: number;
}

function createLocalStorageMock(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(() => {
      data.clear();
    }),
    key: vi.fn((index: number) => [...data.keys()][index] ?? null),
    get length() {
      return data.size;
    },
  };
}

describe('Claude global policy storage helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads and writes the global Claude policy using a dedicated storage key', async () => {
    const localStorageMock = createLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);

    const storageModule = await import('../storage');
    const getClaudeGlobalPolicy = Reflect.get(storageModule, 'getClaudeGlobalPolicy');
    const saveClaudeGlobalPolicy = Reflect.get(storageModule, 'saveClaudeGlobalPolicy');

    expect(typeof getClaudeGlobalPolicy).toBe('function');
    expect(typeof saveClaudeGlobalPolicy).toBe('function');

    const policy: TestClaudeGlobalPolicy = {
      allowedCapabilityIds: ['command:review'],
      blockedCapabilityIds: ['command:dangerous'],
      allowedSharedMcpIds: ['shared:filesystem'],
      blockedSharedMcpIds: [],
      allowedPersonalMcpIds: [],
      blockedPersonalMcpIds: ['personal:secrets'],
      updatedAt: 10,
    };

    (saveClaudeGlobalPolicy as (policy: TestClaudeGlobalPolicy | null) => void)(policy);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      storageModule.STORAGE_KEYS.CLAUDE_GLOBAL_POLICY,
      JSON.stringify(policy)
    );
    expect((getClaudeGlobalPolicy as () => TestClaudeGlobalPolicy | null)()).toEqual(policy);
  });
});
