export interface XtermOutputProtocolIdentifier {
  prefix?: string;
  intermediates?: string;
  final: string;
}

export type XtermOutputProtocolParameters = Array<number | number[]>;

export interface XtermOutputProtocolDisposable {
  dispose: () => void;
}

export interface XtermOutputProtocolParser {
  registerCsiHandler: (
    identifier: XtermOutputProtocolIdentifier,
    handler: (params: XtermOutputProtocolParameters) => boolean
  ) => XtermOutputProtocolDisposable;
  registerDcsHandler: (
    identifier: XtermOutputProtocolIdentifier,
    handler: (data: string, params: XtermOutputProtocolParameters) => boolean
  ) => XtermOutputProtocolDisposable;
  registerOscHandler: (
    identifier: number,
    handler: (data: string) => boolean
  ) => XtermOutputProtocolDisposable;
}

function firstParameter(params: XtermOutputProtocolParameters): number | undefined {
  const first = params[0];
  return Array.isArray(first) ? first[0] : first;
}

function isDefaultQuery(params: XtermOutputProtocolParameters): boolean {
  const first = firstParameter(params);
  return first === undefined || first === 0;
}

function isOneOf(params: XtermOutputProtocolParameters, values: readonly number[]): boolean {
  const first = firstParameter(params);
  return first !== undefined && values.includes(first);
}

function isIndexedColorQuery(data: string): boolean {
  const values = data.split(';');
  if (values.length < 2 || values.length % 2 !== 0) {
    return false;
  }

  for (let index = 0; index < values.length; index += 2) {
    if (!/^\d+$/.test(values[index]) || values[index + 1] !== '?') {
      return false;
    }
  }

  return true;
}

function isSpecialColorQuery(data: string): boolean {
  const values = data.split(';');
  return values.length > 0 && values.every((value) => value === '?');
}

export function installXtermOutputProtocolGuard(
  parser: XtermOutputProtocolParser,
  isWritingBackendOutput: () => boolean
): XtermOutputProtocolDisposable {
  const suppressDefaultQuery = (params: XtermOutputProtocolParameters) =>
    isWritingBackendOutput() && isDefaultQuery(params);
  const suppressDeviceStatusQuery = (params: XtermOutputProtocolParameters) =>
    isWritingBackendOutput() && isOneOf(params, [5, 6]);
  const suppressPrivateDeviceStatusQuery = (params: XtermOutputProtocolParameters) =>
    isWritingBackendOutput() && isOneOf(params, [6, 996]);
  const suppressWindowReportQuery = (params: XtermOutputProtocolParameters) =>
    isWritingBackendOutput() && isOneOf(params, [11, 13, 14, 15, 16, 18, 19, 20, 21]);
  const suppressAnyBackendOutputQuery = () => isWritingBackendOutput();
  const suppressIndexedColorQuery = (data: string) =>
    isWritingBackendOutput() && isIndexedColorQuery(data);
  const suppressSpecialColorQuery = (data: string) =>
    isWritingBackendOutput() && isSpecialColorQuery(data);

  const disposables = [
    parser.registerCsiHandler({ final: 'c' }, suppressDefaultQuery),
    parser.registerCsiHandler({ prefix: '>', final: 'c' }, suppressDefaultQuery),
    parser.registerCsiHandler({ prefix: '=', final: 'c' }, suppressDefaultQuery),
    parser.registerCsiHandler({ final: 'n' }, suppressDeviceStatusQuery),
    parser.registerCsiHandler({ prefix: '?', final: 'n' }, suppressPrivateDeviceStatusQuery),
    parser.registerCsiHandler({ prefix: '>', final: 'q' }, suppressDefaultQuery),
    parser.registerCsiHandler({ final: 't' }, suppressWindowReportQuery),
    parser.registerCsiHandler({ final: 'x' }, suppressDefaultQuery),
    parser.registerCsiHandler({ intermediates: '$', final: 'p' }, suppressAnyBackendOutputQuery),
    parser.registerCsiHandler(
      { prefix: '?', intermediates: '$', final: 'p' },
      suppressAnyBackendOutputQuery
    ),
    parser.registerCsiHandler({ prefix: '?', final: 'u' }, suppressAnyBackendOutputQuery),
    parser.registerDcsHandler({ intermediates: '$', final: 'q' }, (_data, _params) =>
      suppressAnyBackendOutputQuery()
    ),
    parser.registerDcsHandler({ intermediates: '+', final: 'q' }, (_data, _params) =>
      suppressAnyBackendOutputQuery()
    ),
    parser.registerOscHandler(4, suppressIndexedColorQuery),
    parser.registerOscHandler(10, suppressSpecialColorQuery),
    parser.registerOscHandler(11, suppressSpecialColorQuery),
    parser.registerOscHandler(12, suppressSpecialColorQuery),
  ];

  return {
    dispose: () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}
