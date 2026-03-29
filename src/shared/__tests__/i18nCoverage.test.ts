import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const { readdirSync, readFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function collectTranslationKeyFiles(): string[] {
  const roots = ['src/main', 'src/renderer'] as const;
  const files: string[] = [];

  for (const root of roots) {
    const directory = resolve(repoRoot, root);
    for (const extension of ['ts', 'tsx']) {
      const pattern = new RegExp(`\\.${extension}$`);
      for (const filePath of walkFiles(directory)) {
        if (!pattern.test(filePath)) continue;
        if (filePath.includes('/__tests__/')) continue;
        files.push(filePath.replace(`${repoRoot}/`, ''));
      }
    }
  }

  return files.sort();
}

function walkFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolutePath));
      continue;
    }
    files.push(absolutePath);
  }
  return files;
}

const rawLiteralBlacklist: Record<string, string[]> = {
  'src/renderer/components/terminal/TerminalSearchBar.tsx': ['aria-label="Search terminal output"'],
  'src/renderer/components/chat/QuickTerminalButton.tsx': ['title="Quick Terminal (Ctrl+`)'],
  'src/renderer/components/AppErrorBoundary.tsx': [
    '>The app ran into an unexpected error.<',
    '>Reload App<',
  ],
  'src/renderer/components/files/BreadcrumbTreeMenu.tsx': ['>Empty directory<'],
  'src/renderer/components/files/PdfPreview.tsx': ['加载 PDF...', '重试', '适应宽度'],
  'src/renderer/components/ui/toast.tsx': ['aria-label="Close notification"'],
  'src/renderer/components/layout/RunningProjectsPopover.tsx': ["t.title || 'Terminal'"],
  'src/renderer/components/todo/KanbanBoard.tsx': ["todo: 'To Do'", "'in-progress': 'In Progress'"],
  'src/renderer/components/todo/TaskCard.tsx': [
    "return 'Just now';",
    '${' + 'minutes}m ago',
    '${' + 'hours}h ago',
    '${' + 'days}d ago',
  ],
  'src/renderer/components/layout/tree-sidebar/TempWorkspaceTreeItem.tsx': [
    '>agents<',
    '>terminals<',
  ],
  'src/renderer/components/layout/tree-sidebar/WorktreeTreeItem.tsx': [
    '>publish<',
    '>agents<',
    '>terminals<',
  ],
  'src/renderer/components/layout/worktree-panel/WorktreeItem.tsx': [
    '>publish<',
    '>agents<',
    '>terminals<',
  ],
  'src/renderer/components/layout/WindowControls.tsx': [
    'aria-label="Minimize"',
    `? 'Restore' : 'Maximize'`,
    'aria-label="Restore"',
    'aria-label="Close"',
    'title="Close"',
  ],
  'src/renderer/components/source-control/CommitHistoryList.tsx': [
    '>Hash:<',
    '>Author:<',
    '>Date:<',
    '>Message:<',
  ],
  'src/renderer/components/source-control/DiffReviewModal.tsx': [
    "return 'Added';",
    "return 'Deleted';",
    "return 'Modified';",
    "return 'Renamed';",
    "return 'Copied';",
    "return 'Unmerged';",
    "return 'Unknown';",
  ],
  'src/renderer/components/ui/pagination.tsx': [
    'aria-label="pagination"',
    'aria-label="Go to previous page"',
    '>Previous<',
    'aria-label="Go to next page"',
    '>Next<',
    '>More pages<',
  ],
  'src/renderer/components/ui/breadcrumb.tsx': ['>More<'],
  'src/renderer/components/ui/sheet.tsx': ['aria-label="Close"'],
  'src/renderer/components/ui/dialog.tsx': ['aria-label="Close"'],
  'src/renderer/components/ui/spinner.tsx': ['aria-label="Loading"'],
  'src/renderer/components/ui/combobox.tsx': ['aria-label="Remove"'],
  'src/renderer/components/app/OpenInMenu.tsx': [
    '>Loading...<',
    '>No Apps<',
    '>Remote Only<',
    '>Quick Open<',
  ],
  'src/renderer/components/ui/sidebar.tsx': [
    '>Sidebar<',
    '>Displays the mobile sidebar.<',
    '>Toggle Sidebar<',
    'aria-label="Toggle Sidebar"',
    'title="Toggle Sidebar"',
  ],
  'src/renderer/components/settings/AppearanceSettings.tsx': [
    '>Cover<',
    '>Contain<',
    '>Repeat<',
    '>Center<',
  ],
  'src/renderer/components/settings/AgentSettings.tsx': ['placeholder="My Agent"', '>Agent<'],
  'src/renderer/components/ui/mermaid-renderer.tsx': [
    "setError(err instanceof Error ? err.message : 'Mermaid render failed');",
    '>Mermaid 渲染错误<',
    '>加载 Mermaid 图表...<',
  ],
  'src/renderer/components/settings/plugins/MarketplacesDialog.tsx': [
    'placeholder="owner/repo or GitHub URL"',
  ],
  'src/renderer/components/settings/mcp/McpServerDialog.tsx': ['>URL *<'],
  'src/renderer/components/settings/GeneralSettings.tsx': [
    '>Current Log File<',
    '>Recent Log Output<',
  ],
};

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function collectTranslationMapKeys(source: string): Set<string> {
  const objectSource = source.split('};', 1)[0] ?? source;
  const keys = new Set<string>();
  for (const match of objectSource.matchAll(/\n\s*'([^']+)'\s*:/g)) {
    keys.add(match[1]);
  }
  for (const match of objectSource.matchAll(/\n\s*"([^"]+)"\s*:/g)) {
    keys.add(match[1]);
  }
  for (const match of objectSource.matchAll(/\n\s*([A-Za-z][A-Za-z0-9 ]*[A-Za-z0-9])\s*:/g)) {
    keys.add(match[1]);
  }
  return keys;
}

function collectLiteralTranslationKeys(source: string): string[] {
  const patterns = [
    /\bt\(\s*'([^']+)'/g,
    /\bt\(\s*"([^"]+)"/g,
    /\btNode\(\s*'([^']+)'/g,
    /\btNode\(\s*"([^"]+)"/g,
    /translate\([^,]+,\s*'([^']+)'/g,
    /translate\([^,]+,\s*"([^"]+)"/g,
  ];

  const keys: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const key = match[1];
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
  }
  return keys;
}

describe('i18n coverage for current UI surfaces', () => {
  it('provides zh translations for literal translation keys in the hardened surfaces', () => {
    const translationKeys = collectTranslationMapKeys(readRepoFile('src/shared/i18n.ts'));
    const missing: Array<{ file: string; key: string }> = [];

    for (const relativePath of collectTranslationKeyFiles()) {
      const source = readRepoFile(relativePath);
      const keys = collectLiteralTranslationKeys(source);
      for (const key of keys) {
        if (!translationKeys.has(key)) {
          missing.push({ file: relativePath, key });
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('does not leave known raw English or mixed-language UI literals in the hardened surfaces', () => {
    const offenders: Array<{ file: string; literal: string }> = [];

    for (const [relativePath, literals] of Object.entries(rawLiteralBlacklist)) {
      const source = readRepoFile(relativePath);
      for (const literal of literals) {
        if (source.includes(literal)) {
          offenders.push({ file: relativePath, literal });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
