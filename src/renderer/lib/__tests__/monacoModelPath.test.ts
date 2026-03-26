import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/files/monacoSetup', () => ({
  monaco: {
    Uri: {
      file: vi.fn((path: string) => ({
        toString: () => `file://${path.replace(/\\/g, '/')}`,
      })),
      from: vi.fn(({ scheme, path }: { scheme: string; path: string }) => ({
        toString: () => `${scheme}://${path}`,
      })),
    },
  },
}));

import { toMonacoFileUri, toMonacoVirtualUri } from '../monacoModelPath';

describe('monacoModelPath', () => {
  it('builds file URIs through the monaco file helper', () => {
    expect(toMonacoFileUri('/repo/src/App.tsx')).toBe('file:///repo/src/App.tsx');
    expect(toMonacoFileUri('C:\\repo\\src\\App.tsx')).toBe('file://C:/repo/src/App.tsx');
  });

  it('normalizes virtual paths before creating monaco URIs', () => {
    expect(toMonacoVirtualUri('remote', 'workspace/src/index.ts')).toBe(
      'remote:///workspace/src/index.ts'
    );
    expect(toMonacoVirtualUri('remote', '/workspace/src/index.ts')).toBe(
      'remote:///workspace/src/index.ts'
    );
    expect(toMonacoVirtualUri('remote', 'workspace\\src\\index.ts')).toBe(
      'remote:///workspace/src/index.ts'
    );
  });
});
