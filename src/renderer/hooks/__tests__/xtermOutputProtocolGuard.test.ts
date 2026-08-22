import { describe, expect, it, vi } from 'vitest';
import {
  installXtermOutputProtocolGuard,
  type XtermOutputProtocolIdentifier,
  type XtermOutputProtocolParameters,
} from '../xtermOutputProtocolGuard';

interface CsiRegistration {
  identifier: XtermOutputProtocolIdentifier;
  handler: (params: XtermOutputProtocolParameters) => boolean;
}

interface DcsRegistration {
  identifier: XtermOutputProtocolIdentifier;
  handler: (data: string, params: XtermOutputProtocolParameters) => boolean;
}

interface OscRegistration {
  identifier: number;
  handler: (data: string) => boolean;
}

function createParser() {
  const csi: CsiRegistration[] = [];
  const dcs: DcsRegistration[] = [];
  const osc: OscRegistration[] = [];
  const disposables = [] as Array<{ dispose: ReturnType<typeof vi.fn> }>;
  const createDisposable = () => {
    const disposable = { dispose: vi.fn() };
    disposables.push(disposable);
    return disposable;
  };

  return {
    parser: {
      registerCsiHandler: (
        identifier: XtermOutputProtocolIdentifier,
        handler: (params: XtermOutputProtocolParameters) => boolean
      ) => {
        csi.push({ identifier, handler });
        return createDisposable();
      },
      registerDcsHandler: (
        identifier: XtermOutputProtocolIdentifier,
        handler: (data: string, params: XtermOutputProtocolParameters) => boolean
      ) => {
        dcs.push({ identifier, handler });
        return createDisposable();
      },
      registerOscHandler: (identifier: number, handler: (data: string) => boolean) => {
        osc.push({ identifier, handler });
        return createDisposable();
      },
    },
    csi,
    dcs,
    osc,
    disposables,
  };
}

function findCsiHandler(
  registrations: CsiRegistration[],
  identifier: XtermOutputProtocolIdentifier
): (params: XtermOutputProtocolParameters) => boolean {
  const registration = registrations.find(
    (candidate) => JSON.stringify(candidate.identifier) === JSON.stringify(identifier)
  );
  if (!registration) {
    throw new Error(`Missing CSI registration: ${JSON.stringify(identifier)}`);
  }
  return registration.handler;
}

function findDcsHandler(
  registrations: DcsRegistration[],
  identifier: XtermOutputProtocolIdentifier
): (data: string, params: XtermOutputProtocolParameters) => boolean {
  const registration = registrations.find(
    (candidate) => JSON.stringify(candidate.identifier) === JSON.stringify(identifier)
  );
  if (!registration) {
    throw new Error(`Missing DCS registration: ${JSON.stringify(identifier)}`);
  }
  return registration.handler;
}

describe('installXtermOutputProtocolGuard', () => {
  it('suppresses only backend-output queries that would generate terminal responses', () => {
    const registrations = createParser();
    let writingBackendOutput = false;
    installXtermOutputProtocolGuard(registrations.parser, () => writingBackendOutput);

    const secondaryAttributes = findCsiHandler(registrations.csi, { prefix: '>', final: 'c' });
    const tertiaryAttributes = findCsiHandler(registrations.csi, { prefix: '=', final: 'c' });
    const version = findCsiHandler(registrations.csi, { prefix: '>', final: 'q' });
    const deviceStatus = findCsiHandler(registrations.csi, { final: 'n' });
    const windowReport = findCsiHandler(registrations.csi, { final: 't' });
    const terminalParameters = findCsiHandler(registrations.csi, { final: 'x' });
    const modeReport = findCsiHandler(registrations.csi, {
      intermediates: '$',
      final: 'p',
    });
    const terminfoCapabilities = findDcsHandler(registrations.dcs, {
      intermediates: '+',
      final: 'q',
    });

    expect(secondaryAttributes([0])).toBe(false);
    expect(tertiaryAttributes([0])).toBe(false);
    expect(version([0])).toBe(false);
    expect(deviceStatus([6])).toBe(false);
    expect(windowReport([11])).toBe(false);
    expect(terminalParameters([0])).toBe(false);
    expect(modeReport([25])).toBe(false);
    expect(terminfoCapabilities('5445524d', [])).toBe(false);

    writingBackendOutput = true;

    expect(secondaryAttributes([0])).toBe(true);
    expect(tertiaryAttributes([0])).toBe(true);
    expect(version([0])).toBe(true);
    expect(deviceStatus([6])).toBe(true);
    expect(windowReport([11])).toBe(true);
    expect(terminalParameters([0])).toBe(true);
    expect(modeReport([25])).toBe(true);
    expect(terminfoCapabilities('5445524d', [])).toBe(true);
    expect(secondaryAttributes([1])).toBe(false);
    expect(tertiaryAttributes([1])).toBe(false);
    expect(deviceStatus([4])).toBe(false);
    expect(windowReport([22, 0])).toBe(false);
    expect(terminalParameters([1])).toBe(false);
  });

  it('suppresses only pure backend-output color queries', () => {
    const registrations = createParser();
    let writingBackendOutput = true;
    installXtermOutputProtocolGuard(registrations.parser, () => writingBackendOutput);

    const indexedColor = registrations.osc.find((registration) => registration.identifier === 4);
    const foreground = registrations.osc.find((registration) => registration.identifier === 10);

    expect(indexedColor?.handler('1;?;2;?')).toBe(true);
    expect(indexedColor?.handler('1;#112233')).toBe(false);
    expect(indexedColor?.handler('1;?;2;#112233')).toBe(false);
    expect(foreground?.handler('?;?')).toBe(true);
    expect(foreground?.handler('rgb:ffff/ffff/ffff')).toBe(false);

    writingBackendOutput = false;

    expect(indexedColor?.handler('1;?')).toBe(false);
    expect(foreground?.handler('?')).toBe(false);
  });

  it('disposes every registered parser guard', () => {
    const registrations = createParser();
    const guard = installXtermOutputProtocolGuard(registrations.parser, () => false);

    guard.dispose();

    expect(registrations.disposables).toHaveLength(17);
    for (const disposable of registrations.disposables) {
      expect(disposable.dispose).toHaveBeenCalledTimes(1);
    }
  });
});
