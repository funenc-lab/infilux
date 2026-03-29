export const terminalSearchI18nKeys = {
  caseSensitiveTitle: 'Case Sensitive (Aa)',
  close: 'Close (Esc)',
  closeAriaLabel: 'Close search',
  findNext: 'Find next match',
  findPrevious: 'Find previous match',
  nextTitle: 'Next (Enter)',
  placeholder: 'Search...',
  previousTitle: 'Previous (Shift+Enter)',
  regexAriaLabel: 'Toggle regular expression search',
  regexTitle: 'Regular Expression',
  searchAriaLabel: 'Search terminal output',
  toggleCaseSensitive: 'Toggle case sensitive search',
  toggleWholeWord: 'Toggle whole word search',
  wholeWordTitle: 'Whole Word',
} as const;

export const quickTerminalI18nKeys = {
  buttonLabel: 'Quick Terminal',
  shortcutTitle: 'Quick Terminal (Ctrl+`)',
} as const;

export const appErrorBoundaryI18nKeys = {
  copyDiagnostics: 'Copy Diagnostics',
  description:
    'You can reload the renderer now. Diagnostic details can also be copied for debugging.',
  heading: 'The app ran into an unexpected error.',
  reload: 'Reload App',
} as const;

export const breadcrumbMenuI18nKeys = {
  emptyDirectory: 'Empty directory',
} as const;

export const pdfPreviewI18nKeys = {
  fitWidth: 'Fit Width',
  loading: 'Loading PDF...',
  loadFailed: 'PDF load failed',
  renderFailed: 'Page render failed',
  retry: 'Retry',
} as const;

export const toastI18nKeys = {
  closeNotification: 'Close notification',
} as const;

export const todoI18nKeys = {
  relativeTime: {
    daysAgo: '{{count}}d ago',
    hoursAgo: '{{count}}h ago',
    justNow: 'Just now',
    minutesAgo: '{{count}}m ago',
  },
  status: {
    done: 'Done',
    inProgress: 'In Progress',
    todo: 'To Do',
  },
} as const;
