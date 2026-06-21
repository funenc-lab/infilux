import { getTranslation, type Locale, normalizeLocale } from '@shared/i18n';
import * as React from 'react';
import { useSettingsStore } from '@/stores/settings';

export type TFunction = (key: string, params?: Record<string, string | number>) => string;
type RichParams = Record<string, React.ReactNode>;

const decodeEscapedUnicode = (value: string): string =>
  value.replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16))
  );

const rendererZhTranslations: Record<string, string> = {
  'Import from EnsoAI': decodeEscapedUnicode('\\u4ece EnsoAI \\u5bfc\\u5165'),
  'Repository sidebar actions': decodeEscapedUnicode('\\u4ed3\\u5e93\\u4fa7\\u680f\\u64cd\\u4f5c'),
  'Bring to Front': decodeEscapedUnicode('\\u7f6e\\u4e8e\\u524d\\u53f0'),
  'Back to Canvas': decodeEscapedUnicode('\\u8fd4\\u56de\\u753b\\u5e03'),
  'Dismiss Floating Session': decodeEscapedUnicode('\\u6536\\u8d77\\u60ac\\u6d6e\\u4f1a\\u8bdd'),
  'Tab Layout': decodeEscapedUnicode('\\u6807\\u7b7e\\u5e03\\u5c40'),
  'Worktree Canvas': decodeEscapedUnicode('Worktree \\u753b\\u5e03'),
  'Repository Canvas': decodeEscapedUnicode('\\u4ed3\\u5e93\\u753b\\u5e03'),
  'Workspace Canvas': decodeEscapedUnicode('\\u5de5\\u4f5c\\u533a\\u753b\\u5e03'),
  'Canvas terminal mount limit': decodeEscapedUnicode(
    '\\u753b\\u5e03\\u7ec8\\u7aef\\u6302\\u8f7d\\u4e0a\\u9650'
  ),
  'Maximum mounted agent terminals in canvas views. Higher values use more memory.':
    decodeEscapedUnicode(
      '\\u753b\\u5e03\\u89c6\\u56fe\\u4e2d\\u540c\\u65f6\\u6302\\u8f7d\\u7684 Agent \\u7ec8\\u7aef\\u4e0a\\u9650\\u3002\\u6570\\u503c\\u8d8a\\u9ad8\\uff0c\\u5360\\u7528\\u5185\\u5b58\\u8d8a\\u591a\\u3002'
    ),
  'Show sessions as tabs inside the active worktree': decodeEscapedUnicode(
    '\\u5728\\u5f53\\u524d Worktree \\u5185\\u4ee5\\u6807\\u7b7e\\u663e\\u793a\\u4f1a\\u8bdd'
  ),
  'Show the active worktree sessions on an infinite canvas': decodeEscapedUnicode(
    '\\u5728\\u65e0\\u9650\\u753b\\u5e03\\u4e2d\\u663e\\u793a\\u5f53\\u524d Worktree \\u4f1a\\u8bdd'
  ),
  'Show all agent sessions in the current repository, grouped by worktree': decodeEscapedUnicode(
    '\\u5728\\u5f53\\u524d\\u4ed3\\u5e93\\u4e2d\\u6309 Worktree \\u5206\\u7ec4\\u663e\\u793a\\u6240\\u6709 Agent \\u4f1a\\u8bdd'
  ),
  'Show all agent sessions across worktrees, grouped by worktree': decodeEscapedUnicode(
    '\\u5728\\u6240\\u6709 Worktree \\u4e2d\\u6309 Worktree \\u5206\\u7ec4\\u663e\\u793a\\u6240\\u6709 Agent \\u4f1a\\u8bdd'
  ),
  'Show active worktrees and agent sessions on one shared canvas': decodeEscapedUnicode(
    '\\u5728\\u4e00\\u4e2a\\u5171\\u4eab\\u753b\\u5e03\\u4e2d\\u663e\\u793a\\u6d3b\\u8dc3 Worktree \\u548c Agent \\u4f1a\\u8bdd'
  ),
  'Choose how agent sessions are displayed': decodeEscapedUnicode(
    '\\u9009\\u62e9 Agent \\u4f1a\\u8bdd\\u7684\\u5c55\\u793a\\u65b9\\u5f0f'
  ),
  'Current Worktree': decodeEscapedUnicode('\\u5f53\\u524d Worktree'),
  'Repository workspace': decodeEscapedUnicode('\\u4ed3\\u5e93\\u5de5\\u4f5c\\u533a'),
  'Current worktree: {{name}}': decodeEscapedUnicode('\\u5f53\\u524d Worktree\\uff1a{{name}}'),
  'Agent Sessions': decodeEscapedUnicode('Agent \\u4f1a\\u8bdd'),
  'Latest retained output': decodeEscapedUnicode('\\u6700\\u65b0\\u4fdd\\u7559\\u8f93\\u51fa'),
  'No active agent session selected.': decodeEscapedUnicode(
    '\\u672a\\u9009\\u62e9\\u6d3b\\u52a8 Agent \\u4f1a\\u8bdd\\u3002'
  ),
  '{{count}} chars': decodeEscapedUnicode('{{count}} \\u5b57\\u7b26'),
  '{{count}} matches': decodeEscapedUnicode('{{count}} \\u4e2a\\u5339\\u914d'),
  'Lines {{start}}-{{end}} of {{total}}': decodeEscapedUnicode(
    '\\u7b2c {{start}}-{{end}} \\u884c\\uff0c\\u5171 {{total}} \\u884c'
  ),
  Latest: decodeEscapedUnicode('\\u6700\\u65b0'),
  '{{count}} older matches are omitted from this view.': decodeEscapedUnicode(
    '\\u6b64\\u89c6\\u56fe\\u5df2\\u7701\\u7565 {{count}} \\u6761\\u8f83\\u65e9\\u5339\\u914d\\u7ed3\\u679c\\u3002'
  ),
  '{{count}} older retained lines are omitted from this view.': decodeEscapedUnicode(
    '\\u6b64\\u89c6\\u56fe\\u5df2\\u7701\\u7565 {{count}} \\u884c\\u8f83\\u65e9\\u4fdd\\u7559\\u5185\\u5bb9\\u3002'
  ),
  'No matching retained output': decodeEscapedUnicode(
    '\\u6ca1\\u6709\\u5339\\u914d\\u7684\\u4fdd\\u7559\\u8f93\\u51fa'
  ),
  'No retained terminal output yet': decodeEscapedUnicode(
    '\\u6682\\u65e0\\u4fdd\\u7559\\u7684\\u7ec8\\u7aef\\u8f93\\u51fa'
  ),
  'Adjust the search query to inspect this retained transcript.': decodeEscapedUnicode(
    '\\u8c03\\u6574\\u641c\\u7d22\\u5185\\u5bb9\\u4ee5\\u67e5\\u770b\\u6b64\\u4fdd\\u7559\\u4f1a\\u8bdd\\u8bb0\\u5f55\\u3002'
  ),
  'Run the session or wait for output before opening the transcript.': decodeEscapedUnicode(
    '\\u8fd0\\u884c\\u4f1a\\u8bdd\\u6216\\u7b49\\u5f85\\u8f93\\u51fa\\u540e\\u518d\\u6253\\u5f00\\u4f1a\\u8bdd\\u8bb0\\u5f55\\u3002'
  ),
  'Terminal keeps a lightweight live scrollback; this drawer reads the latest retained replay snapshot.':
    decodeEscapedUnicode(
      '\\u7ec8\\u7aef\\u4ec5\\u4fdd\\u7559\\u8f7b\\u91cf\\u5b9e\\u65f6\\u6eda\\u52a8\\u7f13\\u51b2\\uff1b\\u6b64\\u62bd\\u5c49\\u8bfb\\u53d6\\u6700\\u65b0\\u4fdd\\u7559\\u7684\\u56de\\u653e\\u5feb\\u7167\\u3002'
    ),
  'Unable to copy transcript output.': decodeEscapedUnicode(
    '\\u65e0\\u6cd5\\u590d\\u5236\\u4f1a\\u8bdd\\u8bb0\\u5f55\\u8f93\\u51fa\\u3002'
  ),
  Export: decodeEscapedUnicode('\\u5bfc\\u51fa'),
  'Export failed': decodeEscapedUnicode('\\u5bfc\\u51fa\\u5931\\u8d25'),
  'Unable to export transcript output.': decodeEscapedUnicode(
    '\\u65e0\\u6cd5\\u5bfc\\u51fa\\u4f1a\\u8bdd\\u8bb0\\u5f55\\u8f93\\u51fa\\u3002'
  ),
  'Needs Attention': decodeEscapedUnicode('\\u9700\\u8981\\u5904\\u7406'),
  'Running Sessions': decodeEscapedUnicode('\\u8fd0\\u884c\\u4e2d\\u4f1a\\u8bdd'),
  'Idle Sessions': decodeEscapedUnicode('\\u7a7a\\u95f2\\u4f1a\\u8bdd'),
  'Ended Sessions': decodeEscapedUnicode('\\u5df2\\u7ed3\\u675f\\u4f1a\\u8bdd'),
  'Review waiting sessions': decodeEscapedUnicode(
    '\\u5904\\u7406\\u7b49\\u5f85\\u8f93\\u5165\\u7684\\u4f1a\\u8bdd'
  ),
  'Inspect unread results': decodeEscapedUnicode('\\u67e5\\u770b\\u672a\\u8bfb\\u7ed3\\u679c'),
  'Review stale sessions': decodeEscapedUnicode(
    '\\u68c0\\u67e5\\u9700\\u5237\\u65b0\\u7684\\u4f1a\\u8bdd'
  ),
  'Monitor running sessions': decodeEscapedUnicode(
    '\\u89c2\\u5bdf\\u8fd0\\u884c\\u4e2d\\u4f1a\\u8bdd'
  ),
  'All sessions idle': decodeEscapedUnicode('\\u5168\\u90e8\\u4f1a\\u8bdd\\u7a7a\\u95f2'),
  'No active sessions': decodeEscapedUnicode('\\u6ca1\\u6709\\u6d3b\\u52a8\\u4f1a\\u8bdd'),
  'No agent sessions': decodeEscapedUnicode('\\u6682\\u65e0 Agent \\u4f1a\\u8bdd'),
  'New in Current Worktree': decodeEscapedUnicode('\\u5728\\u5f53\\u524d Worktree \\u65b0\\u5efa'),
  'New Session in {{name}}': decodeEscapedUnicode('\\u5728 {{name}} \\u65b0\\u5efa Session'),
  '{{count}} sessions': decodeEscapedUnicode('{{count}} \\u4e2a\\u4f1a\\u8bdd'),
  '{{count}} agent sessions': decodeEscapedUnicode('{{count}} \\u4e2a Agent \\u4f1a\\u8bdd'),
  '{{count}} total': decodeEscapedUnicode('\\u5171 {{count}} \\u4e2a'),
  '{{count}} running': decodeEscapedUnicode('{{count}} \\u4e2a\\u8fd0\\u884c\\u4e2d'),
  '{{count}} waiting': decodeEscapedUnicode('{{count}} \\u4e2a\\u7b49\\u5f85\\u8f93\\u5165'),
  'Start an agent session to track its status here.': decodeEscapedUnicode(
    '\\u542f\\u52a8 Agent \\u4f1a\\u8bdd\\u540e\\uff0c\\u53ef\\u5728\\u6b64\\u8ddf\\u8e2a\\u72b6\\u6001\\u3002'
  ),
  'Task: {{title}}': decodeEscapedUnicode('\\u4efb\\u52a1\\uff1a{{title}}'),
  'Move task': decodeEscapedUnicode('\\u79fb\\u52a8\\u4efb\\u52a1'),
  Running: decodeEscapedUnicode('\\u8fd0\\u884c\\u4e2d'),
  Waiting: decodeEscapedUnicode('\\u7b49\\u5f85'),
  Unread: decodeEscapedUnicode('\\u672a\\u8bfb'),
  Idle: decodeEscapedUnicode('\\u7a7a\\u95f2'),
  Dead: decodeEscapedUnicode('\\u5df2\\u7ec8\\u6b62'),
  Active: decodeEscapedUnicode('\\u5f53\\u524d'),
  Stale: decodeEscapedUnicode('\\u9700\\u5237\\u65b0'),
  Attachment: decodeEscapedUnicode('\\u9644\\u4ef6'),
  Attachments: decodeEscapedUnicode('\\u9644\\u4ef6'),
  'Attachment paste unavailable': decodeEscapedUnicode(
    '\\u5f53\\u524d\\u65e0\\u6cd5\\u7c98\\u8d34\\u9644\\u4ef6'
  ),
  'Attachment too large': decodeEscapedUnicode('\\u9644\\u4ef6\\u8fc7\\u5927'),
  'Wait for the agent to finish responding before pasting attachments.': decodeEscapedUnicode(
    '\\u8bf7\\u7b49\\u5f85 Agent \\u5b8c\\u6210\\u56de\\u590d\\u540e\\u518d\\u7c98\\u8d34\\u9644\\u4ef6\\u3002'
  ),
  'Wait for the agent prompt before pasting attachments.': decodeEscapedUnicode(
    '\\u8bf7\\u7b49\\u5f85 Agent \\u63d0\\u793a\\u8f93\\u5165\\u540e\\u518d\\u7c98\\u8d34\\u9644\\u4ef6\\u3002'
  ),
  '{{label}} must be smaller than {{limit}} MB to paste into the agent input. Largest pasted file: {{size}} MB.':
    decodeEscapedUnicode(
      '{{label}} \\u5fc5\\u987b\\u5c0f\\u4e8e {{limit}} MB \\u624d\\u80fd\\u7c98\\u8d34\\u5230 Agent \\u8f93\\u5165\\u6846\\u3002\\u5f53\\u524d\\u7c98\\u8d34\\u6587\\u4ef6\\u4e2d\\u6700\\u5927\\u7684\\u662f {{size}} MB\\u3002'
    ),
  'Tree sidebar actions': decodeEscapedUnicode('\\u6811\\u5f62\\u4fa7\\u680f\\u64cd\\u4f5c'),
  'Show all worktrees': decodeEscapedUnicode('\\u663e\\u793a\\u5168\\u90e8\\u5de5\\u4f5c\\u6811'),
  'Only show Agent worktrees': decodeEscapedUnicode(
    '\\u4ec5\\u663e\\u793a Agent \\u5de5\\u4f5c\\u6811'
  ),
  'Only show live Agent sessions': decodeEscapedUnicode(
    '\\u4ec5\\u663e\\u793a\\u6d3b\\u8dc3 Agent \\u4f1a\\u8bdd'
  ),
  'No live Agent worktrees': decodeEscapedUnicode('\\u6682\\u65e0\\u6d3b\\u8dc3 Agent Worktree'),
  'This repository has no worktree with a live Agent session.': decodeEscapedUnicode(
    '\\u6b64\\u4ed3\\u5e93\\u6ca1\\u6709\\u5305\\u542b\\u6d3b\\u8dc3 Agent \\u4f1a\\u8bdd\\u7684 Worktree\\u3002'
  ),
  'Agent runtime': decodeEscapedUnicode('Agent \\u8fd0\\u884c\\u65f6'),
  'Preparing runtime': decodeEscapedUnicode('\\u6b63\\u5728\\u51c6\\u5907\\u8fd0\\u884c\\u65f6'),
  'Attaching the terminal and waiting for the agent prompt.': decodeEscapedUnicode(
    '\\u6b63\\u5728\\u9644\\u7740\\u7ec8\\u7aef\\u5e76\\u7b49\\u5f85 Agent \\u63d0\\u793a\\u8f93\\u5165\\u3002'
  ),
  'Still preparing': decodeEscapedUnicode('\\u4ecd\\u5728\\u51c6\\u5907'),
  'Runtime is taking longer than expected. Retry if the terminal stays quiet.':
    decodeEscapedUnicode(
      '\\u8fd0\\u884c\\u65f6\\u8017\\u65f6\\u8d85\\u51fa\\u9884\\u671f\\u3002\\u5982\\u679c\\u7ec8\\u7aef\\u6301\\u7eed\\u65e0\\u8f93\\u51fa\\uff0c\\u53ef\\u4ee5\\u91cd\\u8bd5\\u3002'
    ),
  'This skill is disabled in policy, but its source file is inside this worktree .claude/skills folder. Claude may still auto-load it until the file is moved, renamed, or removed.':
    decodeEscapedUnicode(
      '\\u6b64 Skill \\u5df2\\u5728\\u7b56\\u7565\\u4e2d\\u7981\\u7528\\uff0c\\u4f46\\u5b83\\u7684\\u6e90\\u6587\\u4ef6\\u4ecd\\u4f4d\\u4e8e\\u6b64 worktree \\u7684 .claude/skills \\u6587\\u4ef6\\u5939\\u4e2d\\u3002Claude \\u4ecd\\u53ef\\u80fd\\u81ea\\u52a8\\u52a0\\u8f7d\\u5b83\\uff0c\\u76f4\\u5230\\u8be5\\u6587\\u4ef6\\u88ab\\u79fb\\u52a8\\u3001\\u91cd\\u547d\\u540d\\u6216\\u79fb\\u9664\\u3002'
    ),
  'Disable file': decodeEscapedUnicode('\\u7981\\u7528\\u6587\\u4ef6'),
  'Quarantined Skills': decodeEscapedUnicode('\\u5df2\\u9694\\u79bb\\u7684 Skill'),
  'Skill folders moved out of this worktree .claude/skills path.': decodeEscapedUnicode(
    '\\u5df2\\u4ece\\u6b64 worktree \\u7684 .claude/skills \\u8def\\u5f84\\u79fb\\u51fa\\u7684 Skill \\u6587\\u4ef6\\u5939\\u3002'
  ),
  Quarantined: decodeEscapedUnicode('\\u5df2\\u9694\\u79bb'),
  'Restore file': decodeEscapedUnicode('\\u6062\\u590d\\u6587\\u4ef6'),
  'Skill file disabled': decodeEscapedUnicode('Skill \\u6587\\u4ef6\\u5df2\\u7981\\u7528'),
  'The skill folder was moved out of the worktree .claude/skills path.': decodeEscapedUnicode(
    '\\u8be5 Skill \\u6587\\u4ef6\\u5939\\u5df2\\u79fb\\u51fa worktree \\u7684 .claude/skills \\u8def\\u5f84\\u3002'
  ),
  'Unable to disable skill file': decodeEscapedUnicode(
    '\\u65e0\\u6cd5\\u7981\\u7528 Skill \\u6587\\u4ef6'
  ),
  'Skill file restored': decodeEscapedUnicode('Skill \\u6587\\u4ef6\\u5df2\\u6062\\u590d'),
  'The skill folder was moved back into the worktree .claude/skills path.': decodeEscapedUnicode(
    '\\u8be5 Skill \\u6587\\u4ef6\\u5939\\u5df2\\u79fb\\u56de worktree \\u7684 .claude/skills \\u8def\\u5f84\\u3002'
  ),
  'Unable to restore skill file': decodeEscapedUnicode(
    '\\u65e0\\u6cd5\\u6062\\u590d Skill \\u6587\\u4ef6'
  ),
  'Needs attention': decodeEscapedUnicode('\\u9700\\u8981\\u5173\\u6ce8'),
  'Agent worktrees': decodeEscapedUnicode('Agent \\u5de5\\u4f5c\\u6811'),
  'Worktree panel actions': decodeEscapedUnicode('Worktree \\u9762\\u677f\\u64cd\\u4f5c'),
  'Temp session actions': decodeEscapedUnicode('\\u4e34\\u65f6\\u4f1a\\u8bdd\\u64cd\\u4f5c'),
  'File sidebar actions': decodeEscapedUnicode('\\u6587\\u4ef6\\u4fa7\\u680f\\u64cd\\u4f5c'),
  'Refreshing files': decodeEscapedUnicode('\\u6b63\\u5728\\u5237\\u65b0\\u6587\\u4ef6'),
  'Refresh files': decodeEscapedUnicode('\\u5237\\u65b0\\u6587\\u4ef6'),
  'Collapse repository sidebar': decodeEscapedUnicode(
    '\\u6298\\u53e0\\u4ed3\\u5e93\\u4fa7\\u8fb9\\u680f'
  ),
  'Running projects: {{count}}': decodeEscapedUnicode(
    '\\u8fd0\\u884c\\u4e2d\\u9879\\u76ee\\uff1a{{count}}'
  ),
  'Refresh temp sessions': decodeEscapedUnicode('\\u5237\\u65b0\\u4e34\\u65f6\\u4f1a\\u8bdd'),
  'Collapse temp sessions sidebar': decodeEscapedUnicode(
    '\\u6298\\u53e0\\u4e34\\u65f6\\u4f1a\\u8bdd\\u4fa7\\u8fb9\\u680f'
  ),
  'Refreshing projects': decodeEscapedUnicode('\\u6b63\\u5728\\u5237\\u65b0\\u9879\\u76ee'),
  'Refresh projects': decodeEscapedUnicode('\\u5237\\u65b0\\u9879\\u76ee'),
  'Manage repositories': decodeEscapedUnicode('\\u7ba1\\u7406\\u4ed3\\u5e93'),
  'Collapse sidebar': decodeEscapedUnicode('\\u6298\\u53e0\\u4fa7\\u8fb9\\u680f'),
  'Remote unavailable': decodeEscapedUnicode('\\u8fdc\\u7a0b\\u4e0d\\u53ef\\u7528'),
  'Refreshing worktrees': decodeEscapedUnicode('\\u6b63\\u5728\\u5237\\u65b0 Worktree'),
  'Refresh worktrees': decodeEscapedUnicode('\\u5237\\u65b0 Worktree'),
  'Expand repository sidebar': decodeEscapedUnicode(
    '\\u5c55\\u5f00\\u4ed3\\u5e93\\u4fa7\\u8fb9\\u680f'
  ),
  'Collapse worktree sidebar': decodeEscapedUnicode(
    '\\u6298\\u53e0 Worktree \\u4fa7\\u8fb9\\u680f'
  ),
  'Expand Temp Sessions': decodeEscapedUnicode('\\u5c55\\u5f00\\u4e34\\u65f6\\u4f1a\\u8bdd'),
  'Search Files': decodeEscapedUnicode('\\u641c\\u7d22\\u6587\\u4ef6'),
  'Searching files...': decodeEscapedUnicode('\\u6b63\\u5728\\u641c\\u7d22\\u6587\\u4ef6...'),
  'Searching files and directories...': decodeEscapedUnicode(
    '\\u6b63\\u5728\\u641c\\u7d22\\u6587\\u4ef6\\u548c\\u76ee\\u5f55...'
  ),
  'No files or directories found': decodeEscapedUnicode(
    '\\u672a\\u627e\\u5230\\u6587\\u4ef6\\u6216\\u76ee\\u5f55'
  ),
  '{{count}} minutes': decodeEscapedUnicode('{{count}} \\u5206\\u949f'),
  'Chat panel retention': decodeEscapedUnicode(
    '\\u804a\\u5929\\u9762\\u677f\\u4fdd\\u7559\\u65f6\\u957f'
  ),
  'How long to keep an idle chat panel mounted after you switch away.': decodeEscapedUnicode(
    '\\u5207\\u6362\\u79bb\\u5f00\\u540e\\uff0c\\u7a7a\\u95f2\\u804a\\u5929\\u9762\\u677f\\u4fdd\\u6301\\u6302\\u8f7d\\u7684\\u65f6\\u957f\\u3002'
  ),
  'Preview and import settings from an EnsoAI settings.json file': decodeEscapedUnicode(
    '\\u9884\\u89c8\\u5e76\\u5bfc\\u5165 EnsoAI settings.json \\u6587\\u4ef6\\u4e2d\\u7684\\u8bbe\\u7f6e'
  ),
  'Settings import': decodeEscapedUnicode('\\u8bbe\\u7f6e\\u5bfc\\u5165'),
  'Detect the typical EnsoAI settings locations first, or choose a settings.json file manually and review the changed keys before applying them.':
    decodeEscapedUnicode(
      '\\u5148\\u68c0\\u6d4b\\u5e38\\u89c1\\u7684 EnsoAI \\u8bbe\\u7f6e\\u4f4d\\u7f6e\\uff0c\\u6216\\u624b\\u52a8\\u9009\\u62e9 settings.json \\u6587\\u4ef6\\uff0c\\u5e76\\u5728\\u5e94\\u7528\\u524d\\u67e5\\u770b\\u53d8\\u66f4\\u952e\\u3002'
    ),
  'Loading preview...': decodeEscapedUnicode('\\u6b63\\u5728\\u52a0\\u8f7d\\u9884\\u89c8...'),
  'Detect automatically': decodeEscapedUnicode('\\u81ea\\u52a8\\u68c0\\u6d4b'),
  'Choose settings file': decodeEscapedUnicode('\\u9009\\u62e9\\u8bbe\\u7f6e\\u6587\\u4ef6'),
  'Typical paths': decodeEscapedUnicode('\\u5e38\\u89c1\\u8def\\u5f84'),
  'Auto Execute Agent': decodeEscapedUnicode('\\u81ea\\u52a8\\u6267\\u884c Agent'),
  'Auto: {{agent}}': decodeEscapedUnicode('\\u81ea\\u52a8\\uff1a{{agent}}'),
  'Auto execute with {{agent}}': decodeEscapedUnicode(
    '\\u4f7f\\u7528 {{agent}} \\u81ea\\u52a8\\u6267\\u884c'
  ),
  'AI Center': decodeEscapedUnicode('AI \\u667a\\u80fd\\u4e2d\\u5fc3'),
  'Cross-project AI orchestration': decodeEscapedUnicode('\\u8de8\\u9879\\u76ee AI \\u7f16\\u6392'),
  'Unable to load AI Center': decodeEscapedUnicode(
    '\\u65e0\\u6cd5\\u52a0\\u8f7d AI \\u667a\\u80fd\\u4e2d\\u5fc3'
  ),
  'Loading AI Center': decodeEscapedUnicode(
    '\\u6b63\\u5728\\u52a0\\u8f7d AI \\u667a\\u80fd\\u4e2d\\u5fc3'
  ),
  'Project Todo': decodeEscapedUnicode('\\u9879\\u76ee\\u5f85\\u529e'),
  'Current project': decodeEscapedUnicode('\\u5f53\\u524d\\u9879\\u76ee'),
  'No project selected': decodeEscapedUnicode('\\u672a\\u9009\\u62e9\\u9879\\u76ee'),
  'Task board': decodeEscapedUnicode('\\u4efb\\u52a1\\u770b\\u677f'),
  'Unable to load tasks': decodeEscapedUnicode('\\u65e0\\u6cd5\\u52a0\\u8f7d\\u4efb\\u52a1'),
  'Loaded Projects': decodeEscapedUnicode('\\u5df2\\u52a0\\u8f7d\\u9879\\u76ee'),
  Projects: decodeEscapedUnicode('\\u9879\\u76ee'),
  'Open Tasks': decodeEscapedUnicode('\\u672a\\u5b8c\\u6210\\u4efb\\u52a1'),
  'Ready Tasks': decodeEscapedUnicode('\\u53ef\\u6267\\u884c\\u4efb\\u52a1'),
  'Blocked Tasks': decodeEscapedUnicode('\\u963b\\u585e\\u4efb\\u52a1'),
  Approvals: decodeEscapedUnicode('\\u5ba1\\u6279'),
  'Execution Overview': decodeEscapedUnicode('\\u6267\\u884c\\u6982\\u89c8'),
  'Dispatch Next': decodeEscapedUnicode('\\u4e0b\\u4e00\\u6b65\\u6d3e\\u53d1'),
  'Monitor Running': decodeEscapedUnicode('\\u76d1\\u63a7\\u6267\\u884c\\u4e2d'),
  'Request Approval': decodeEscapedUnicode('\\u8bf7\\u6c42\\u5ba1\\u6279'),
  'Resolve Dependencies': decodeEscapedUnicode('\\u5904\\u7406\\u4f9d\\u8d56'),
  Dispatch: decodeEscapedUnicode('\\u6d3e\\u53d1'),
  Open: decodeEscapedUnicode('\\u6253\\u5f00'),
  Paused: decodeEscapedUnicode('\\u5df2\\u6682\\u505c'),
  'Decision Plan': decodeEscapedUnicode('\\u51b3\\u7b56\\u65b9\\u6848'),
  'Recommended Action': decodeEscapedUnicode('\\u63a8\\u8350\\u52a8\\u4f5c'),
  'Approve blocked tasks': decodeEscapedUnicode('\\u6279\\u51c6\\u963b\\u585e\\u4efb\\u52a1'),
  'Dispatch ready tasks': decodeEscapedUnicode('\\u6d3e\\u53d1\\u53ef\\u6267\\u884c\\u4efb\\u52a1'),
  'Monitor running tasks': decodeEscapedUnicode('\\u76d1\\u63a7\\u8fd0\\u884c\\u4efb\\u52a1'),
  'Resolve task dependencies': decodeEscapedUnicode('\\u5904\\u7406\\u4efb\\u52a1\\u4f9d\\u8d56'),
  'Stand by': decodeEscapedUnicode('\\u5f85\\u547d'),
  'High confidence': decodeEscapedUnicode('\\u9ad8\\u7f6e\\u4fe1\\u5ea6'),
  'Medium confidence': decodeEscapedUnicode('\\u4e2d\\u7b49\\u7f6e\\u4fe1\\u5ea6'),
  'Low confidence': decodeEscapedUnicode('\\u4f4e\\u7f6e\\u4fe1\\u5ea6'),
  'Ask AI Center': decodeEscapedUnicode('\\u8be2\\u95ee AI \\u667a\\u80fd\\u4e2d\\u5fc3'),
  'Dispatch Plan': decodeEscapedUnicode('\\u6d3e\\u53d1\\u65b9\\u6848'),
  'Dispatch Result': decodeEscapedUnicode('\\u6d3e\\u53d1\\u7ed3\\u679c'),
  'Started Projects': decodeEscapedUnicode('\\u5df2\\u542f\\u52a8\\u9879\\u76ee'),
  'Skipped Tasks': decodeEscapedUnicode('\\u5df2\\u8df3\\u8fc7\\u4efb\\u52a1'),
  '{{count}} projects started': decodeEscapedUnicode(
    '{{count}} \\u4e2a\\u9879\\u76ee\\u5df2\\u542f\\u52a8'
  ),
  '{{count}} skipped': decodeEscapedUnicode('{{count}} \\u4e2a\\u5df2\\u8df3\\u8fc7'),
  'No projects started': decodeEscapedUnicode('\\u6682\\u65e0\\u9879\\u76ee\\u542f\\u52a8'),
  'No skipped tasks': decodeEscapedUnicode('\\u6682\\u65e0\\u8df3\\u8fc7\\u4efb\\u52a1'),
  'Project already running': decodeEscapedUnicode('\\u9879\\u76ee\\u5df2\\u5728\\u8fd0\\u884c'),
  'Task not found': decodeEscapedUnicode('\\u4efb\\u52a1\\u4e0d\\u5b58\\u5728'),
  'Missing worktree': decodeEscapedUnicode('\\u7f3a\\u5c11 worktree'),
  'No enabled agents': decodeEscapedUnicode('\\u6ca1\\u6709\\u5df2\\u542f\\u7528 Agent'),
  'Start failed': decodeEscapedUnicode('\\u542f\\u52a8\\u5931\\u8d25'),
  'Coordination Signals': decodeEscapedUnicode('\\u534f\\u540c\\u4fe1\\u53f7'),
  'cross-project': decodeEscapedUnicode('\\u8de8\\u9879\\u76ee'),
  'agent-coverage': decodeEscapedUnicode('Agent \\u8986\\u76d6'),
  intervention: decodeEscapedUnicode('\\u5e72\\u9884'),
  monitoring: decodeEscapedUnicode('\\u76d1\\u63a7'),
  'task-splitting': decodeEscapedUnicode('\\u4efb\\u52a1\\u62c6\\u5206'),
  'Coordinate cross-project dispatch': decodeEscapedUnicode(
    '\\u534f\\u8c03\\u8de8\\u9879\\u76ee\\u6d3e\\u53d1'
  ),
  'Reassign unavailable agent tasks': decodeEscapedUnicode(
    '\\u91cd\\u5206\\u4e0d\\u53ef\\u7528 Agent \\u7684\\u4efb\\u52a1'
  ),
  'Review intervention queue': decodeEscapedUnicode('\\u590d\\u6838\\u5e72\\u9884\\u961f\\u5217'),
  'Monitor active executions': decodeEscapedUnicode(
    '\\u76d1\\u63a7\\u6b63\\u5728\\u6267\\u884c\\u7684\\u4efb\\u52a1'
  ),
  'Split dispatch into staged batches': decodeEscapedUnicode(
    '\\u5c06\\u6d3e\\u53d1\\u62c6\\u5206\\u4e3a\\u5206\\u9636\\u6279\\u6b21'
  ),
  'Risk Review': decodeEscapedUnicode('\\u98ce\\u9669\\u590d\\u6838'),
  'Decision Worklist': decodeEscapedUnicode('\\u51b3\\u7b56\\u5de5\\u4f5c\\u6e05\\u5355'),
  'Intervention Queue': decodeEscapedUnicode('\\u5e72\\u9884\\u961f\\u5217'),
  'Monitoring Queue': decodeEscapedUnicode('\\u76d1\\u63a7\\u961f\\u5217'),
  'Deferred Queue': decodeEscapedUnicode('\\u5ef6\\u540e\\u961f\\u5217'),
  'No dispatch plan': decodeEscapedUnicode('\\u6682\\u65e0\\u6d3e\\u53d1\\u65b9\\u6848'),
  'No risks': decodeEscapedUnicode('\\u6682\\u65e0\\u98ce\\u9669'),
  '{{count}} batches': decodeEscapedUnicode('{{count}} \\u4e2a\\u6279\\u6b21'),
  '{{count}} risks': decodeEscapedUnicode('{{count}} \\u4e2a\\u98ce\\u9669'),
  '{{count}} items': decodeEscapedUnicode('{{count}} \\u9879'),
  high: decodeEscapedUnicode('\\u9ad8'),
  medium: decodeEscapedUnicode('\\u4e2d'),
  low: decodeEscapedUnicode('\\u4f4e'),
  'Blocked tasks need intervention': decodeEscapedUnicode(
    '\\u963b\\u585e\\u4efb\\u52a1\\u9700\\u8981\\u5e72\\u9884'
  ),
  'Some assigned agents are unavailable': decodeEscapedUnicode(
    '\\u90e8\\u5206\\u6307\\u5b9a Agent \\u4e0d\\u53ef\\u7528'
  ),
  'Running task state is detached from auto-execute state': decodeEscapedUnicode(
    '\\u8fd0\\u884c\\u4efb\\u52a1\\u72b6\\u6001\\u4e0e\\u81ea\\u52a8\\u6267\\u884c\\u72b6\\u6001\\u8131\\u8282'
  ),
  'Ready to Dispatch': decodeEscapedUnicode('\\u53ef\\u6d3e\\u53d1'),
  'Needs Intervention': decodeEscapedUnicode('\\u9700\\u8981\\u5e72\\u9884'),
  'Running Now': decodeEscapedUnicode('\\u6b63\\u5728\\u6267\\u884c'),
  'Open task': decodeEscapedUnicode('\\u6253\\u5f00\\u4efb\\u52a1'),
  '{{count}} open': decodeEscapedUnicode('{{count}} \\u4e2a\\u672a\\u5b8c\\u6210'),
  '{{count}} ready': decodeEscapedUnicode('{{count}} \\u4e2a\\u5c31\\u7eea'),
  '{{count}} blocked': decodeEscapedUnicode('{{count}} \\u4e2a\\u963b\\u585e'),
  '{{count}} active': decodeEscapedUnicode('{{count}} \\u4e2a\\u6d3b\\u52a8'),
  'Dispatch Queue': decodeEscapedUnicode('\\u6d3e\\u53d1\\u961f\\u5217'),
  Interventions: decodeEscapedUnicode('\\u5e72\\u9884\\u9879'),
  'No interventions': decodeEscapedUnicode('\\u6682\\u65e0\\u5e72\\u9884\\u9879'),
  'Dependency Blocked': decodeEscapedUnicode('\\u4f9d\\u8d56\\u963b\\u585e'),
  'No running tasks': decodeEscapedUnicode('\\u6682\\u65e0\\u8fd0\\u884c\\u4e2d\\u4efb\\u52a1'),
  'No deferred tasks': decodeEscapedUnicode('\\u6682\\u65e0\\u5ef6\\u540e\\u4efb\\u52a1'),
  'Agent Load': decodeEscapedUnicode('Agent \\u8d1f\\u8f7d'),
  'No agent load': decodeEscapedUnicode('\\u6682\\u65e0 Agent \\u8d1f\\u8f7d'),
  'Project State': decodeEscapedUnicode('\\u9879\\u76ee\\u72b6\\u6001'),
  'No loaded projects': decodeEscapedUnicode('\\u6682\\u65e0\\u5df2\\u52a0\\u8f7d\\u9879\\u76ee'),
  'Select a repository to load project tasks into this center.': decodeEscapedUnicode(
    '\\u9009\\u62e9\\u4e00\\u4e2a\\u4ed3\\u5e93\\u540e\\uff0c\\u9879\\u76ee\\u4efb\\u52a1\\u4f1a\\u52a0\\u8f7d\\u5230\\u6b64\\u4e2d\\u5fc3\\u3002'
  ),
  'Auto Select': decodeEscapedUnicode('\\u81ea\\u52a8\\u9009\\u62e9'),
  'Executing with {{agent}}...': decodeEscapedUnicode(
    '\\u6b63\\u5728\\u4f7f\\u7528 {{agent}} \\u6267\\u884c...'
  ),
  Run: decodeEscapedUnicode('\\u8fd0\\u884c'),
  'Task Agent': decodeEscapedUnicode('\\u4efb\\u52a1 Agent'),
  'Task details and execution context.': decodeEscapedUnicode(
    '\\u4efb\\u52a1\\u8be6\\u60c5\\u4e0e\\u6267\\u884c\\u4e0a\\u4e0b\\u6587\\u3002'
  ),
  'Basic Details': decodeEscapedUnicode('\\u57fa\\u672c\\u4fe1\\u606f'),
  'Execution Settings': decodeEscapedUnicode('\\u6267\\u884c\\u8bbe\\u7f6e'),
  'AI Tasks': decodeEscapedUnicode('AI \\u4efb\\u52a1'),
  'Plan Tasks with AI': decodeEscapedUnicode('\\u7528 AI \\u89c4\\u5212\\u4efb\\u52a1'),
  'Describe the work and review generated tasks before creating them.': decodeEscapedUnicode(
    '\\u63cf\\u8ff0\\u8981\\u5b8c\\u6210\\u7684\\u5de5\\u4f5c\\uff0c\\u521b\\u5efa\\u524d\\u5148\\u68c0\\u67e5\\u751f\\u6210\\u7684\\u4efb\\u52a1\\u3002'
  ),
  'Work request': decodeEscapedUnicode('\\u5de5\\u4f5c\\u9700\\u6c42'),
  'Describe the goal, constraints, and expected outcome...': decodeEscapedUnicode(
    '\\u63cf\\u8ff0\\u76ee\\u6807\\u3001\\u7ea6\\u675f\\u548c\\u9884\\u671f\\u7ed3\\u679c...'
  ),
  'Describe the goal, constraints, and @files to include...': decodeEscapedUnicode(
    '\\u63cf\\u8ff0\\u76ee\\u6807\\u3001\\u7ea6\\u675f\\u548c\\u8981\\u5f15\\u5165\\u7684 @\\u6587\\u4ef6...'
  ),
  'Describe the goal, constraints, and @context to include...': decodeEscapedUnicode(
    '\\u63cf\\u8ff0\\u76ee\\u6807\\u3001\\u7ea6\\u675f\\u548c\\u8981\\u5f15\\u5165\\u7684 @\\u4e0a\\u4e0b\\u6587...'
  ),
  'Failed to generate tasks': decodeEscapedUnicode('\\u751f\\u6210\\u4efb\\u52a1\\u5931\\u8d25'),
  '{{count}} enabled agents': decodeEscapedUnicode('{{count}} \\u4e2a\\u5df2\\u542f\\u7528 Agent'),
  '{{count}} generated tasks': decodeEscapedUnicode(
    '{{count}} \\u4e2a\\u751f\\u6210\\u4efb\\u52a1'
  ),
  'No generated tasks': decodeEscapedUnicode('\\u6682\\u65e0\\u751f\\u6210\\u4efb\\u52a1'),
  'Generate Tasks': decodeEscapedUnicode('\\u751f\\u6210\\u4efb\\u52a1'),
  'No tasks yet': decodeEscapedUnicode('\\u6682\\u65e0\\u4efb\\u52a1'),
  'Generate tasks from a work request, or create one manually.': decodeEscapedUnicode(
    '\\u6839\\u636e\\u5de5\\u4f5c\\u9700\\u6c42\\u751f\\u6210\\u4efb\\u52a1\\uff0c\\u6216\\u624b\\u52a8\\u521b\\u5efa\\u4e00\\u4e2a\\u4efb\\u52a1\\u3002'
  ),
  Task: decodeEscapedUnicode('\\u4efb\\u52a1'),
  'Tasks created': decodeEscapedUnicode('\\u4efb\\u52a1\\u5df2\\u521b\\u5efa'),
  'Created {{count}} tasks': decodeEscapedUnicode(
    '\\u5df2\\u521b\\u5efa {{count}} \\u4e2a\\u4efb\\u52a1'
  ),
  'Create selected tasks': decodeEscapedUnicode('\\u521b\\u5efa\\u9009\\u4e2d\\u4efb\\u52a1'),
  'Code implementation fit': decodeEscapedUnicode('\\u9002\\u5408\\u4ee3\\u7801\\u5b9e\\u73b0'),
  'Code review fit': decodeEscapedUnicode('\\u9002\\u5408\\u4ee3\\u7801\\u5ba1\\u67e5'),
  'Research and context fit': decodeEscapedUnicode(
    '\\u9002\\u5408\\u8c03\\u7814\\u548c\\u4e0a\\u4e0b\\u6587\\u5206\\u6790'
  ),
  'Large context fit': decodeEscapedUnicode('\\u9002\\u5408\\u5927\\u4e0a\\u4e0b\\u6587'),
  'Default agent': decodeEscapedUnicode('\\u9ed8\\u8ba4 Agent'),
  'Task agent selection': decodeEscapedUnicode('\\u4efb\\u52a1\\u6307\\u5b9a Agent'),
  'Manual selection': decodeEscapedUnicode('\\u624b\\u52a8\\u9009\\u62e9'),
  'Task Context': decodeEscapedUnicode('\\u4efb\\u52a1\\u4e0a\\u4e0b\\u6587'),
  Dependencies: decodeEscapedUnicode('\\u4f9d\\u8d56\\u4efb\\u52a1'),
  '{{count}} dependencies': decodeEscapedUnicode('{{count}} \\u4e2a\\u4f9d\\u8d56'),
  'Depends {{count}}': decodeEscapedUnicode('\\u4f9d\\u8d56 {{count}}'),
  'No dependency tasks available': decodeEscapedUnicode(
    '\\u6682\\u65e0\\u53ef\\u9009\\u4f9d\\u8d56\\u4efb\\u52a1'
  ),
  'Attach current worktree': decodeEscapedUnicode('\\u7ed1\\u5b9a\\u5f53\\u524d Worktree'),
  'Attach file context': decodeEscapedUnicode('\\u7ed1\\u5b9a\\u6587\\u4ef6\\u4e0a\\u4e0b\\u6587'),
  'Attach directory context': decodeEscapedUnicode(
    '\\u7ed1\\u5b9a\\u76ee\\u5f55\\u4e0a\\u4e0b\\u6587'
  ),
  'No active file': decodeEscapedUnicode('\\u672a\\u6253\\u5f00\\u6d3b\\u52a8\\u6587\\u4ef6'),
  'No referenced directories': decodeEscapedUnicode('\\u672a\\u5f15\\u7528\\u76ee\\u5f55'),
  'No worktree selected': decodeEscapedUnicode('\\u672a\\u9009\\u62e9 Worktree'),
  'No ready tasks': decodeEscapedUnicode('\\u6682\\u65e0\\u53ef\\u6267\\u884c\\u4efb\\u52a1'),
  '{{count}} tasks': decodeEscapedUnicode('{{count}} \\u4e2a\\u4efb\\u52a1'),
  '{{count}} directories': decodeEscapedUnicode('{{count}} \\u4e2a\\u76ee\\u5f55'),
  'Completion {{percent}}%': decodeEscapedUnicode('\\u5b8c\\u6210\\u7387 {{percent}}%'),
  Plan: decodeEscapedUnicode('\\u8ba1\\u5212'),
  'Review execution order, agent assignment, and blockers before starting.': decodeEscapedUnicode(
    '\\u542f\\u52a8\\u524d\\u68c0\\u67e5\\u6267\\u884c\\u987a\\u5e8f\\u3001Agent \\u5206\\u914d\\u548c\\u963b\\u585e\\u9879\\u3002'
  ),
  Ready: decodeEscapedUnicode('\\u5c31\\u7eea'),
  Blocked: decodeEscapedUnicode('\\u963b\\u585e'),
  Parallel: decodeEscapedUnicode('\\u5e76\\u884c'),
  Progress: decodeEscapedUnicode('\\u8fdb\\u5ea6'),
  'Waiting for dependency': decodeEscapedUnicode('\\u7b49\\u5f85\\u4f9d\\u8d56'),
  'Waiting for dependencies': decodeEscapedUnicode('\\u7b49\\u5f85\\u4f9d\\u8d56'),
  'Missing dependency': decodeEscapedUnicode('\\u7f3a\\u5931\\u4f9d\\u8d56'),
  Approve: decodeEscapedUnicode('\\u6279\\u51c6'),
  'Approve task': decodeEscapedUnicode('\\u6279\\u51c6\\u4efb\\u52a1'),
  Approved: decodeEscapedUnicode('\\u5df2\\u6279\\u51c6'),
  'Approval Required': decodeEscapedUnicode('\\u9700\\u8981\\u6279\\u51c6'),
  'Waiting for approval': decodeEscapedUnicode('\\u7b49\\u5f85\\u6279\\u51c6'),
  'Review task': decodeEscapedUnicode('\\u67e5\\u770b\\u4efb\\u52a1'),
  'Require approval before auto execute': decodeEscapedUnicode(
    '\\u81ea\\u52a8\\u6267\\u884c\\u524d\\u9700\\u8981\\u6279\\u51c6'
  ),
  'Auto execute will wait until you approve this task.': decodeEscapedUnicode(
    '\\u81ea\\u52a8\\u6267\\u884c\\u4f1a\\u7b49\\u5f85\\u4f60\\u6279\\u51c6\\u8be5\\u4efb\\u52a1\\u3002'
  ),
  'Todo change was not saved': decodeEscapedUnicode('Todo \\u53d8\\u66f4\\u672a\\u4fdd\\u5b58'),
  'Unable to load token usage.': decodeEscapedUnicode(
    '\\u65e0\\u6cd5\\u52a0\\u8f7d token \\u7528\\u91cf\\u3002'
  ),
  'Usage Analytics': decodeEscapedUnicode('\\u7528\\u91cf\\u5206\\u6790'),
  'Project Scope': decodeEscapedUnicode('\\u9879\\u76ee\\u7ef4\\u5ea6'),
  'Token Analytics': decodeEscapedUnicode('Token \\u7edf\\u8ba1'),
  'Token usage summary': decodeEscapedUnicode('Token \\u7528\\u91cf\\u6458\\u8981'),
  'Review project token usage across tracked providers.': decodeEscapedUnicode(
    '\\u67e5\\u770b\\u5df2\\u8ddf\\u8e2a provider \\u7684\\u9879\\u76ee token \\u7528\\u91cf\\u3002'
  ),
  'Break down input, output, cache, and reasoning tokens by project and provider.':
    decodeEscapedUnicode(
      '\\u6309\\u9879\\u76ee\\u4e0e provider \\u6c47\\u603b\\u8f93\\u5165\\u3001\\u8f93\\u51fa\\u3001\\u7f13\\u5b58\\u548c\\u63a8\\u7406 token\\u3002'
    ),
  'Project Totals': decodeEscapedUnicode('\\u9879\\u76ee\\u6c47\\u603b'),
  'Tracked Projects': decodeEscapedUnicode('\\u5df2\\u8ddf\\u8e2a\\u9879\\u76ee'),
  'Provider Coverage': decodeEscapedUnicode('Provider \\u8986\\u76d6'),
  'Total tokens': decodeEscapedUnicode('Token \\u603b\\u91cf'),
  'Provider issues': decodeEscapedUnicode('Provider \\u95ee\\u9898'),
  'Input tokens': decodeEscapedUnicode('\\u8f93\\u5165 token'),
  'Output tokens': decodeEscapedUnicode('\\u8f93\\u51fa token'),
  'Cache tokens': decodeEscapedUnicode('\\u7f13\\u5b58 token'),
  'Prompt cache tokens': decodeEscapedUnicode('\\u63d0\\u793a\\u8bcd\\u7f13\\u5b58 token'),
  'Cached input tokens': decodeEscapedUnicode('\\u7f13\\u5b58\\u8f93\\u5165 token'),
  'Reasoning tokens': decodeEscapedUnicode('\\u63a8\\u7406 token'),
  'Scanning token usage...': decodeEscapedUnicode(
    '\\u6b63\\u5728\\u626b\\u63cf token \\u7528\\u91cf...'
  ),
  'Token Usage': decodeEscapedUnicode('Token \\u7528\\u91cf'),
  'Token Mix': decodeEscapedUnicode('Token \\u6784\\u6210'),
  'Refresh token usage': decodeEscapedUnicode('\\u5237\\u65b0 token \\u7528\\u91cf'),
  'Refreshing token usage': decodeEscapedUnicode(
    '\\u6b63\\u5728\\u5237\\u65b0 token \\u7528\\u91cf'
  ),
  'Fresh scan': decodeEscapedUnicode('\\u6700\\u65b0\\u626b\\u63cf'),
  'Cached snapshot': decodeEscapedUnicode('\\u7f13\\u5b58\\u5feb\\u7167'),
  'Refreshing cached data': decodeEscapedUnicode(
    '\\u6b63\\u5728\\u5237\\u65b0\\u7f13\\u5b58\\u6570\\u636e'
  ),
  'Updated {{time}}': decodeEscapedUnicode('\\u66f4\\u65b0\\u4e8e {{time}}'),
  'No token usage recorded': decodeEscapedUnicode(
    '\\u6682\\u65e0 token \\u7528\\u91cf\\u8bb0\\u5f55'
  ),
  'Open or refresh a supported agent session to populate this scope.': decodeEscapedUnicode(
    '\\u6253\\u5f00\\u6216\\u5237\\u65b0\\u53d7\\u652f\\u6301\\u7684 Agent \\u4f1a\\u8bdd\\u4ee5\\u586b\\u5145\\u5f53\\u524d\\u8303\\u56f4\\u3002'
  ),
  'Review provider coverage for missing or unsupported sources.': decodeEscapedUnicode(
    '\\u68c0\\u67e5 provider \\u8986\\u76d6\\uff0c\\u4ee5\\u786e\\u8ba4\\u7f3a\\u5931\\u6216\\u4e0d\\u652f\\u6301\\u7684\\u6765\\u6e90\\u3002'
  ),
  'Project usage share': decodeEscapedUnicode('\\u9879\\u76ee\\u7528\\u91cf\\u5360\\u6bd4'),
  Unsupported: decodeEscapedUnicode('\\u4e0d\\u652f\\u6301'),
  'No data': decodeEscapedUnicode('\\u65e0\\u6570\\u636e'),
  'Codex usage log directory was not found.': decodeEscapedUnicode(
    'Codex \\u7528\\u91cf\\u65e5\\u5fd7\\u76ee\\u5f55\\u672a\\u627e\\u5230\\u3002'
  ),
  'No Codex usage JSONL files were found.': decodeEscapedUnicode(
    '\\u672a\\u627e\\u5230 Codex \\u7528\\u91cf JSONL \\u6587\\u4ef6\\u3002'
  ),
  'Claude usage log directory was not found.': decodeEscapedUnicode(
    'Claude \\u7528\\u91cf\\u65e5\\u5fd7\\u76ee\\u5f55\\u672a\\u627e\\u5230\\u3002'
  ),
  'No Claude usage JSONL files were found.': decodeEscapedUnicode(
    '\\u672a\\u627e\\u5230 Claude \\u7528\\u91cf JSONL \\u6587\\u4ef6\\u3002'
  ),
  'No stable token usage log was found for this provider.': decodeEscapedUnicode(
    '\\u6b64 provider \\u6682\\u65e0\\u7a33\\u5b9a\\u7684 token \\u7528\\u91cf\\u65e5\\u5fd7\\u3002'
  ),
  'Custom agents need a provider adapter before token usage can be trusted.': decodeEscapedUnicode(
    '\\u81ea\\u5b9a\\u4e49 Agent \\u9700\\u8981 provider adapter \\u540e\\u624d\\u80fd\\u4fe1\\u4efb token \\u7528\\u91cf\\u3002'
  ),
  Refreshing: decodeEscapedUnicode('\\u6b63\\u5728\\u5237\\u65b0'),
  'Loading token usage...': decodeEscapedUnicode(
    '\\u6b63\\u5728\\u52a0\\u8f7d token \\u7528\\u91cf...'
  ),
  'No token usage has been recorded for tracked providers.': decodeEscapedUnicode(
    '\\u5df2\\u8ddf\\u8e2a\\u7684 provider \\u6682\\u65e0 token \\u7528\\u91cf\\u8bb0\\u5f55\\u3002'
  ),
  'Task creation failed. The local change was rolled back.': decodeEscapedUnicode(
    '\\u4efb\\u52a1\\u521b\\u5efa\\u5931\\u8d25\\uff0c\\u672c\\u5730\\u53d8\\u66f4\\u5df2\\u56de\\u6eda\\u3002'
  ),
  'Task update failed. The local change was rolled back.': decodeEscapedUnicode(
    '\\u4efb\\u52a1\\u66f4\\u65b0\\u5931\\u8d25\\uff0c\\u672c\\u5730\\u53d8\\u66f4\\u5df2\\u56de\\u6eda\\u3002'
  ),
  'Task deletion failed. The local change was restored.': decodeEscapedUnicode(
    '\\u4efb\\u52a1\\u5220\\u9664\\u5931\\u8d25\\uff0c\\u672c\\u5730\\u53d8\\u66f4\\u5df2\\u6062\\u590d\\u3002'
  ),
  'Task move failed. The local change was rolled back.': decodeEscapedUnicode(
    '\\u4efb\\u52a1\\u79fb\\u52a8\\u5931\\u8d25\\uff0c\\u672c\\u5730\\u53d8\\u66f4\\u5df2\\u56de\\u6eda\\u3002'
  ),
  'Task reorder failed. The local order was restored.': decodeEscapedUnicode(
    '\\u4efb\\u52a1\\u6392\\u5e8f\\u5931\\u8d25\\uff0c\\u672c\\u5730\\u987a\\u5e8f\\u5df2\\u6062\\u590d\\u3002'
  ),
  'Details: {{message}}': decodeEscapedUnicode('\\u8be6\\u60c5\\uff1a{{message}}'),
};

function getRendererTranslation(locale: Locale, key: string): string {
  if (locale === 'zh') {
    return rendererZhTranslations[key] ?? getTranslation(locale, key);
  }
  return getTranslation(locale, key);
}

function translateRenderer(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const template = getRendererTranslation(locale, key);
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, token) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

function translateNodes(locale: Locale, key: string, params?: RichParams): React.ReactNode {
  const template = getRendererTranslation(locale, key);
  if (!params) return template;

  const parts: React.ReactNode[] = [];
  const regex = /\{\{(\w+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(template);

  while (match) {
    const [placeholder, token] = match;
    const index = match.index;
    if (index > lastIndex) {
      parts.push(template.slice(lastIndex, index));
    }
    parts.push(params[token] ?? placeholder);
    lastIndex = index + placeholder.length;
    match = regex.exec(template);
  }

  if (lastIndex < template.length) {
    parts.push(template.slice(lastIndex));
  }

  // Return a single React element with keyed fragments to avoid key warnings
  return parts.length > 0
    ? React.createElement(
        React.Fragment,
        null,
        ...parts.map((part, i) => React.createElement(React.Fragment, { key: i }, part))
      )
    : template;
}

export function useI18n() {
  const language = useSettingsStore((state) => state.language);
  const locale = normalizeLocale(language);

  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translateRenderer(locale, key, params),
    [locale]
  );

  const tNode = React.useCallback(
    (key: string, params?: RichParams) => translateNodes(locale, key, params),
    [locale]
  );

  return { t, tNode, locale };
}
