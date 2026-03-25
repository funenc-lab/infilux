export function shouldReturnEmptyFileList(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;

  return code === 'ENOENT' || code === 'ENOTDIR';
}
