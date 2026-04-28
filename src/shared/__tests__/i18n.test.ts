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
    expect(getTranslation('zh', 'Recommended font stack')).toBe('推荐字体方案');
    expect(getTranslation('zh', 'Custom font stack')).toBe('自定义字体栈');
    expect(getTranslation('zh', 'New Session')).toBe('新建会话');
    expect(getTranslation('zh', 'Interface sample')).toBe('界面示例');
    expect(getTranslation('zh', 'Workspace control surface')).toBe('工作台控制界面');
    expect(getTranslation('zh', 'Graphite Black')).toBe('石墨黑');
    expect(
      getTranslation(
        'zh',
        'High-clarity graphite-black system with crisp charcoal surfaces, neutral steel focus, and amber support cues.'
      )
    ).toBe('高对比石墨黑系统，采用清晰的炭黑表面、中性钢灰焦点与暖琥珀辅助提示。');
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

  it('translates generic agent integration settings copy in zh locale', () => {
    const integrationKeys = [
      'Agent Integrations',
      'Configure provider routing and CLI-specific integration features',
      'Claude Code IDE Bridge',
      'Start the WebSocket bridge for Claude Code editor context and hooks',
      'Agent Providers',
      'Configure API provider settings for supported agent CLIs',
      'Manage API provider profiles for supported agent CLIs',
      'Watch supported provider settings files for external changes',
    ] as const;

    for (const key of integrationKeys) {
      expect(getTranslation('zh', key)).not.toBe(key);
    }

    expect(getTranslation('zh', 'Agent Integrations')).toBe('Agent \u96c6\u6210');
    expect(getTranslation('zh', 'Agent Providers')).toBe('Agent Provider \u914d\u7f6e');
    expect(getTranslation('zh', 'Claude Code IDE Bridge')).toBe('Claude Code IDE \u6865\u63a5');
  });

  it('keeps app resource panel copy translated in zh locale', () => {
    const resourcePanelKeys = [
      'App runtime status',
      'Runtime Console',
      'Resource Manager',
      'Inspect app runtime pressure and manage available resource actions.',
      'Open runtime activity and resource controls',
      'Monitor sessions, terminals, and runtime pressure',
      'Unable to load resources.',
      'Usage Analytics',
      'Project Scope',
      'Token Analytics',
      'Review project token usage across tracked providers.',
      'Break down input, output, cache, and reasoning tokens by project and provider.',
      'Project Totals',
      'Tracked Projects',
      'Provider Coverage',
      'Total tokens',
      'Provider issues',
      'Input tokens',
      'Output tokens',
      'Cache tokens',
      'Reasoning tokens',
      'Scanning token usage...',
      'Refreshing token usage',
      'Unable to execute action.',
      'Loading resources...',
      'Resource action failed',
      'Services',
      'Reload Renderer',
      'Kill Session',
      'Stop Service',
      'Force Terminate',
      'Renderer process',
      'Browser process',
      'GPU process',
      'Utility process',
      '{{type}} process',
      'Hapi Server',
      'Hapi Runner',
      'Cloudflared',
      'ready',
      'running',
      'reconnecting',
      'stopped',
      'error',
      'unavailable',
      'Working set',
      'Private memory',
      'Working directory',
      'Backend',
      'PID',
      'Port',
      'URL',
      '{{type}} · PID {{pid}}',
      '{{kind}} session',
      '{{backend}} backend',
      '{{backend}} backend · PID {{pid}}',
      '{{service}} status',
      'PID {{pid}}',
      'Electron runtime',
      'Support services',
      'No stale sessions are ready to reclaim.',
      '1 stale session can be reclaimed.',
      '{{count}} stale sessions can be reclaimed.',
      'Reclaim Stale Sessions',
      'Force terminate process?',
      'This will forcibly terminate {{type}} (PID {{pid}}). Unsaved work in that process may be lost.',
      'Reload renderer?',
      'This will reload the current renderer. Unsaved in-memory UI state may be lost.',
      'Kill session?',
      'This will terminate the selected session and its child processes.',
      'Stop service?',
      'This will stop the selected background service for the current app runtime.',
      'Reclaim stale sessions?',
      'This will remove stale session records whose underlying runtime is no longer alive.',
      'Confirm action',
      'Review this action before continuing.',
      '{{memory}} · PID {{pid}}',
      'App overview',
      'App memory',
      'App private memory',
      'Updated at',
      'Renderer working set',
      'Renderer private memory',
      'Renderer shared memory',
      'Renderer resident set',
      'Core processes',
    ] as const;

    for (const key of resourcePanelKeys) {
      expect(getTranslation('zh', key)).not.toBe(key);
    }
  });
});
