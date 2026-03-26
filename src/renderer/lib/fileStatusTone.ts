export type FileStatusTone = 'muted' | 'success' | 'warning' | 'info' | 'destructive';

const FILE_STATUS_TONE_CLASS: Record<FileStatusTone, string> = {
  muted: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  destructive: 'text-destructive',
};

export function getFileStatusTone(status: string): FileStatusTone {
  switch (status) {
    case 'A':
    case 'U':
      return 'success';
    case 'M':
      return 'warning';
    case 'R':
    case 'C':
      return 'info';
    case 'D':
    case 'X':
      return 'destructive';
    default:
      return 'muted';
  }
}

export function getFileStatusTextClass(status: string): string {
  return FILE_STATUS_TONE_CLASS[getFileStatusTone(status)];
}
