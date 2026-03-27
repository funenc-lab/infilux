import { describe, expect, it } from 'vitest';
import { getTranslation, normalizeLocale, translate } from '../i18n';

describe('shared i18n helpers', () => {
  it('normalizes locales to supported values', () => {
    expect(normalizeLocale()).toBe('en');
    expect(normalizeLocale('zh-CN')).toBe('zh');
    expect(normalizeLocale('en-US')).toBe('en');
  });

  it('returns translated values and falls back to the key when missing', () => {
    expect(getTranslation('zh', 'Action Panel')).toBe('操作面板');
    expect(
      getTranslation(
        'zh',
        'Add one to unlock worktrees, files, terminals, and agent sessions from this sidebar.'
      )
    ).toBe('从此侧边栏添加一个仓库，即可解锁 worktree、文件、终端和 Agent 会话。');
    expect(getTranslation('zh', 'Missing key')).toBe('Missing key');
    expect(getTranslation('en', 'Action Panel')).toBe('Action Panel');
    expect(getTranslation('zh', 'Interface typography')).toBe('界面排版');
    expect(getTranslation('zh', 'UI font')).toBe('界面字体');
    expect(getTranslation('zh', 'UI font size')).toBe('界面字号');
    expect(getTranslation('zh', 'Interface sample')).toBe('界面示例');
    expect(getTranslation('zh', 'Workspace control surface')).toBe('工作台控制界面');
  });

  it('interpolates template parameters without replacing unknown tokens', () => {
    expect(
      translate('zh', 'Are you sure you want to delete worktree {{name}}?', { name: 'demo' })
    ).toBe('确定要删除 worktree demo 吗？');
    expect(
      translate('en', 'Changes ({{count}})', {
        count: 5,
      })
    ).toBe('Changes (5)');
    expect(translate('en', 'Hello {{name}} {{missing}}', { name: 'world' })).toBe(
      'Hello world {{missing}}'
    );
  });
});
