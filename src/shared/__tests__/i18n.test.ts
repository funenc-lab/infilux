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
    expect(getTranslation('zh', 'Only show live Agent sessions')).toBe('仅显示活跃 Agent 会话');
    expect(getTranslation('zh', 'Terminal session unavailable')).toBe('终端会话不可用');
    expect(
      getTranslation('zh', 'Terminal session is unavailable. Start a fresh session to continue.')
    ).toBe('终端会话不可用。请开启新会话继续。');
    expect(getTranslation('zh', 'Terminal session reconnecting...')).toBe('终端会话正在重连...');
    expect(
      getTranslation('zh', 'Terminal input is temporarily disabled while the session reconnects.')
    ).toBe('终端会话正在重连，输入暂时不可用。');
    expect(getTranslation('zh', 'No matching worktrees')).toBe(
      '\u6ca1\u6709\u5339\u914d\u7684\u5de5\u4f5c\u6811'
    );
    expect(getTranslation('zh', 'Worktree not found')).toBe('Worktree 不存在');
    expect(getTranslation('zh', 'No matches found')).toBe('没有搜索结果');
    expect(getTranslation('zh', 'Dispatch Result')).toBe('派发结果');
    expect(getTranslation('zh', 'Started Projects')).toBe('已启动项目');
    expect(getTranslation('zh', 'Skipped Tasks')).toBe('已跳过任务');
    expect(
      translate('zh', '{{count}} projects started', {
        count: 2,
      })
    ).toBe('2 个项目已启动');
    expect(translate('zh', '{{count}} skipped', { count: 1 })).toBe('1 个已跳过');
    expect(getTranslation('zh', 'Project already running')).toBe('项目已在运行');
    expect(getTranslation('zh', 'Task not found')).toBe('任务不存在');
    expect(getTranslation('zh', 'Missing worktree')).toBe('缺少 worktree');
    expect(getTranslation('zh', 'No enabled agents')).toBe('没有已启用的 Agent');
    expect(getTranslation('zh', 'Start failed')).toBe('启动失败');
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
      'Agent IDE Bridge',
      'Start provider-supported editor context and lifecycle hook bridges',
      'Agent capability coverage',
      'These controls use provider capabilities instead of assuming every AI tool supports the same hooks.',
      'Capability',
      'Coverage',
      'Supported',
      'Adapter pending',
      'Full coverage',
      'Partial coverage',
      'No coverage',
      '{{count}} capabilities',
      '{{count}} providers',
      '{{supported}}/{{total}} capabilities',
      '{{supported}}/{{total}} providers',
      '{{count}} gaps',
      'No gaps',
      'Provider coverage summary',
      'Capability coverage matrix',
      'Capability coverage legend',
      'Currently supported by {{providers}}',
      'Waiting for provider adapter',
      'Unsupported providers: {{providers}}',
      'Provider config detection',
      'Detect and preview supported CLI provider config files from the current environment.',
      'Editor context bridge',
      'Send editor selection and @mention context to supported agent IDE bridges.',
      'Completion notifications',
      'Use provider lifecycle hooks when available, then fall back to terminal completion markers.',
      'Question notifications',
      'Notify when a supported agent requests user input or permission.',
      'Status telemetry',
      'Show supported agent telemetry such as model, context, and cost at the bottom of the terminal.',
      'Delay before sending selection changes to supported editor bridges',
      'Send selected code range to supported editor bridges',
      'Use provider completion hooks for precise agent completion notifications',
      'Notify when a supported agent asks for input or permission',
      'Show supported agent telemetry (model, context, cost) at bottom of terminal',
      'Agent Providers',
      'Configure API provider settings for supported agent CLIs',
      'Manage API provider profiles for supported agent CLIs',
      'Watch supported provider settings files for external changes',
      'Provider Type',
      'Settings adapter',
      'Provider profile switching is not available for this AI tool yet.',
      'Current CLI Config Detected',
      'Save Current CLI Config',
      'Manual Add Provider',
      'Manual provider settings are for custom gateways and unsupported auto-detection cases.',
      'Provider profile already saved as {{name}}',
      'No supported CLI provider config detected yet.',
      'Open a supported Agent CLI once, then save the detected configuration here.',
      'Save and switch detected provider profiles for supported Agent CLIs',
    ] as const;

    for (const key of integrationKeys) {
      expect(getTranslation('zh', key)).not.toBe(key);
    }

    expect(getTranslation('zh', 'Agent Integrations')).toBe('Agent \u96c6\u6210');
    expect(getTranslation('zh', 'Agent Providers')).toBe('Agent Provider \u914d\u7f6e');
    expect(getTranslation('zh', 'Agent IDE Bridge')).toBe('Agent IDE \u6865\u63a5');
  });

  it('translates generic agent tool routing copy in zh locale', () => {
    const agentToolRoutingKeys = [
      'Default AI tool',
      'New sessions use this tool unless another enabled agent is selected at launch.',
      'No enabled AI tools',
      'Provider profile',
      'Command source',
      'Custom path',
      'Custom agent',
      'Default command',
      'Enable at least one agent before choosing a default AI tool.',
      'Native',
      'CLI managed',
      'Custom CLI',
    ] as const;

    for (const key of agentToolRoutingKeys) {
      expect(getTranslation('zh', key)).not.toBe(key);
    }
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
      'Token usage summary',
      'Review project token usage across tracked providers.',
      'Break down input, output, cache, and reasoning tokens by project and provider.',
      'Project Totals',
      'Tracked Projects',
      'Provider Coverage',
      'Total tokens',
      'Provider issues',
      'Token Mix',
      'Input tokens',
      'Output tokens',
      'Cache tokens',
      'Prompt cache tokens',
      'Cached input tokens',
      'Reasoning tokens',
      'Fresh scan',
      'Cached snapshot',
      'Refreshing cached data',
      'Updated {{time}}',
      'No token usage recorded',
      'Open or refresh a supported agent session to populate this scope.',
      'Review provider coverage for missing or unsupported sources.',
      'Project usage share',
      'Unsupported',
      'No data',
      'Codex usage log directory was not found.',
      'No Codex usage JSONL files were found.',
      'Claude usage log directory was not found.',
      'No Claude usage JSONL files were found.',
      'No stable token usage log was found for this provider.',
      'Custom agents need a provider adapter before token usage can be trusted.',
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
