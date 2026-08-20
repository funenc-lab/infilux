import { describe, expect, it, vi } from 'vitest';
import { SystemFontService } from '../SystemFontService';

describe('SystemFontService', () => {
  it('returns unique sorted font families discovered through the macOS font manager', async () => {
    const runCommand = vi.fn().mockResolvedValue('["Menlo","PingFang SC","Menlo"," "]');
    const service = new SystemFontService({ platform: 'darwin', runCommand });

    await expect(service.listFontFamilies()).resolves.toEqual(['Menlo', 'PingFang SC']);
    await expect(service.listFontFamilies()).resolves.toEqual(['Menlo', 'PingFang SC']);

    expect(runCommand).toHaveBeenCalledOnce();
    expect(runCommand).toHaveBeenCalledWith('osascript', [
      '-l',
      'JavaScript',
      '-e',
      expect.stringContaining('NSFontManager'),
    ]);
  });

  it('splits fontconfig family aliases on Linux', async () => {
    const runCommand = vi.fn().mockResolvedValue('Noto Sans,Noto Sans CJK SC\nFira Code\n');
    const service = new SystemFontService({ platform: 'linux', runCommand });

    await expect(service.listFontFamilies()).resolves.toEqual([
      'Fira Code',
      'Noto Sans',
      'Noto Sans CJK SC',
    ]);
    expect(runCommand).toHaveBeenCalledWith('fc-list', ['--format=%{family}\n']);
  });

  it('keeps a separate native monospace catalog for terminal-oriented settings', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValue('{"families":["Menlo","PingFang SC"],"monospaceFamilies":["Menlo"]}');
    const service = new SystemFontService({ platform: 'darwin', runCommand });

    await expect(service.listFontCatalog()).resolves.toEqual({
      families: ['Menlo', 'PingFang SC'],
      monospaceFamilies: ['Menlo'],
    });
  });

  it('preserves the monospace families reported by Windows discovery', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValue(
        '{"families":["Cascadia Code","Segoe UI"],"monospaceFamilies":["Cascadia Code"]}'
      );
    const service = new SystemFontService({ platform: 'win32', runCommand });

    await expect(service.listFontCatalog()).resolves.toEqual({
      families: ['Cascadia Code', 'Segoe UI'],
      monospaceFamilies: ['Cascadia Code'],
    });
  });

  it('returns an empty catalog when native font discovery fails', async () => {
    const service = new SystemFontService({
      platform: 'win32',
      runCommand: vi.fn().mockRejectedValue(new Error('command unavailable')),
    });

    await expect(service.listFontFamilies()).resolves.toEqual([]);
  });
});
