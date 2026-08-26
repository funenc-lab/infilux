import { describe, expect, it, vi } from 'vitest';
import {
  installXtermTmuxOuterAlternateBufferGuard,
  type XtermTmuxOuterAlternateBufferIdentifier,
  type XtermTmuxOuterAlternateBufferParameters,
} from '../xtermTmuxOuterAlternateBufferGuard';

interface CsiRegistration {
  identifier: XtermTmuxOuterAlternateBufferIdentifier;
  handler: (params: XtermTmuxOuterAlternateBufferParameters) => boolean;
}

function createParser() {
  const csi: CsiRegistration[] = [];
  const disposables = [] as Array<{ dispose: ReturnType<typeof vi.fn> }>;

  return {
    parser: {
      registerCsiHandler: (
        identifier: XtermTmuxOuterAlternateBufferIdentifier,
        handler: (params: XtermTmuxOuterAlternateBufferParameters) => boolean
      ) => {
        csi.push({ identifier, handler });
        const disposable = { dispose: vi.fn() };
        disposables.push(disposable);
        return disposable;
      },
    },
    csi,
    disposables,
  };
}

function getHandler(
  registrations: CsiRegistration[],
  final: 'h' | 'l'
): (params: XtermTmuxOuterAlternateBufferParameters) => boolean {
  const registration = registrations.find(
    (candidate) => candidate.identifier.prefix === '?' && candidate.identifier.final === final
  );
  if (!registration) {
    throw new Error(`Missing tmux alternate-buffer handler for ${final}`);
  }
  return registration.handler;
}

describe('installXtermTmuxOuterAlternateBufferGuard', () => {
  it('keeps tmux outer alternate-buffer transitions out of the xterm viewport', () => {
    const registrations = createParser();
    const guard = installXtermTmuxOuterAlternateBufferGuard(registrations.parser);
    const enable = getHandler(registrations.csi, 'h');
    const disable = getHandler(registrations.csi, 'l');

    expect(enable([47])).toBe(true);
    expect(enable([1047])).toBe(true);
    expect(enable([1049])).toBe(true);
    expect(disable([1049])).toBe(true);
    expect(enable([25])).toBe(false);
    expect(enable([1049, 25])).toBe(false);

    guard.dispose();

    expect(registrations.disposables).toHaveLength(2);
    for (const disposable of registrations.disposables) {
      expect(disposable.dispose).toHaveBeenCalledTimes(1);
    }
  });
});
