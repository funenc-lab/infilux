interface FileTreeRuntimeDiagnosticsOptions {
  isDev: boolean;
  mode: string;
}

export function shouldEmitFileTreeRuntimeDiagnostics({
  isDev,
  mode,
}: FileTreeRuntimeDiagnosticsOptions): boolean {
  return mode !== 'test' && isDev;
}
