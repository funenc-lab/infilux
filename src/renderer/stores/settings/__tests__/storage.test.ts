import { beforeEach, describe, expect, it, vi } from 'vitest';
import { electronStorage } from '../storage';

describe('electronStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a serialized slice for getItem', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        settings: {
          read: vi.fn().mockResolvedValue({
            'enso-settings': {
              state: {
                theme: 'dark',
              },
            },
          }),
        },
      },
    });

    await expect(electronStorage.getItem('enso-settings')).resolves.toBe(
      JSON.stringify({
        state: {
          theme: 'dark',
        },
      })
    );
  });

  it('merges existing persisted data on setItem and deletes only the named key on removeItem', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        other: { keep: true },
      })
      .mockResolvedValueOnce({
        'enso-settings': { state: { theme: 'dark' } },
        other: { keep: true },
      });
    const write = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('window', {
      electronAPI: {
        settings: {
          read,
          write,
        },
      },
    });

    await electronStorage.setItem('enso-settings', JSON.stringify({ state: { theme: 'dark' } }));
    await electronStorage.removeItem('enso-settings');

    expect(write).toHaveBeenNthCalledWith(1, {
      other: { keep: true },
      'enso-settings': { state: { theme: 'dark' } },
    });
    expect(write).toHaveBeenNthCalledWith(2, {
      other: { keep: true },
    });
  });
});
