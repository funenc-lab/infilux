import { describe, expect, it } from 'vitest';
import { getCurrentLocale, setCurrentLocale } from '../i18n';

describe('main i18n service', () => {
  it('normalizes locale updates and keeps the latest value', () => {
    setCurrentLocale('zh-CN');
    expect(getCurrentLocale()).toBe('zh');

    setCurrentLocale('invalid-locale');
    expect(getCurrentLocale()).toBe('en');
  });
});
