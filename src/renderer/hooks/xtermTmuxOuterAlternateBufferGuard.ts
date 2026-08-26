export interface XtermTmuxOuterAlternateBufferIdentifier {
  prefix?: string;
  final: string;
}

export type XtermTmuxOuterAlternateBufferParameters = Array<number | number[]>;

interface XtermTmuxOuterAlternateBufferDisposable {
  dispose: () => void;
}

export interface XtermTmuxOuterAlternateBufferParser {
  registerCsiHandler: (
    identifier: XtermTmuxOuterAlternateBufferIdentifier,
    handler: (params: XtermTmuxOuterAlternateBufferParameters) => boolean
  ) => XtermTmuxOuterAlternateBufferDisposable;
}

const TMUX_OUTER_ALTERNATE_BUFFER_MODES = new Set([47, 1047, 1049]);

function isTmuxOuterAlternateBufferTransition(
  params: XtermTmuxOuterAlternateBufferParameters
): boolean {
  if (params.length !== 1) {
    return false;
  }

  const mode = params[0];
  return typeof mode === 'number' && TMUX_OUTER_ALTERNATE_BUFFER_MODES.has(mode);
}

export function installXtermTmuxOuterAlternateBufferGuard(
  parser: XtermTmuxOuterAlternateBufferParser
): XtermTmuxOuterAlternateBufferDisposable {
  const suppressOuterAlternateBufferTransition = (
    params: XtermTmuxOuterAlternateBufferParameters
  ) => isTmuxOuterAlternateBufferTransition(params);
  const disposables = [
    parser.registerCsiHandler({ prefix: '?', final: 'h' }, suppressOuterAlternateBufferTransition),
    parser.registerCsiHandler({ prefix: '?', final: 'l' }, suppressOuterAlternateBufferTransition),
  ];

  return {
    dispose: () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}
