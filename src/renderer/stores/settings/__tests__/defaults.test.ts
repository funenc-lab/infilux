import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultLocale,
  getDefaultShellConfig,
  getDefaultUIFontFamily,
  getRecommendedUIFontPresets,
  validateCodeReviewPrompt,
} from '../defaults';

describe('settings defaults helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates code review templates for required variables, warnings, and unknown placeholders', () => {
    expect(validateCodeReviewPrompt('   ')).toEqual({
      valid: false,
      errors: ['Prompt template cannot be empty'],
      warnings: [],
    });

    expect(validateCodeReviewPrompt('Review {git_log} only')).toEqual({
      valid: false,
      errors: ['Missing required variable: {git_diff}'],
      warnings: ['Missing recommended variable: {language}'],
    });

    expect(
      validateCodeReviewPrompt('Use {language} {git_diff} {git_log} {custom_var} {broken')
    ).toEqual({
      valid: true,
      errors: [],
      warnings: ['Unmatched braces detected in template', 'Unknown variable: {custom_var}'],
    });
  });

  it('detects the default locale from navigator and falls back to english', () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    expect(getDefaultLocale()).toBe('zh');

    vi.unstubAllGlobals();
    expect(getDefaultLocale()).toBe('en');
  });

  it('chooses the platform default shell config from the Electron environment', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          platform: 'win32',
        },
      },
    });
    expect(getDefaultShellConfig()).toEqual({ shellType: 'powershell' });

    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          platform: 'darwin',
        },
      },
    });
    expect(getDefaultShellConfig()).toEqual({ shellType: 'system' });

    vi.stubGlobal('window', {});
    expect(getDefaultShellConfig()).toEqual({ shellType: 'system' });
  });

  it('returns locale-aware UI font defaults for known and unknown platforms', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          platform: 'linux',
        },
      },
    });
    expect(getDefaultUIFontFamily('zh')).toBe(
      '"Noto Sans CJK SC", "Noto Sans", "Ubuntu", "Liberation Sans", system-ui, sans-serif'
    );
    expect(getDefaultUIFontFamily('en')).toBe(
      '"Noto Sans", "Ubuntu", "Liberation Sans", system-ui, sans-serif'
    );

    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          platform: 'freebsd',
        },
      },
    });
    expect(getDefaultUIFontFamily('zh')).toBe(
      '"PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", system-ui, sans-serif'
    );
    expect(getDefaultUIFontFamily('en')).toBe(
      '"Aptos", "SF Pro Text", "Segoe UI Variable Text", "Noto Sans", system-ui, sans-serif'
    );
  });

  it('orders recommended UI font presets by locale and removes duplicate families', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          platform: 'darwin',
        },
      },
    });

    expect(getRecommendedUIFontPresets('en')).toEqual([
      {
        id: 'platform-default',
        fontFamily: '"SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
      },
      {
        id: 'cjk-priority',
        fontFamily:
          '"PingFang SC", "Hiragino Sans GB", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
      },
    ]);

    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          platform: 'freebsd',
        },
      },
    });

    expect(getRecommendedUIFontPresets('zh')).toEqual([
      {
        id: 'platform-default',
        fontFamily:
          '"PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", system-ui, sans-serif',
      },
      {
        id: 'english-priority',
        fontFamily:
          '"Aptos", "SF Pro Text", "Segoe UI Variable Text", "Noto Sans", system-ui, sans-serif',
      },
    ]);
  });
});
