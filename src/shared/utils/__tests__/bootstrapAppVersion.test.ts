import { describe, expect, it } from 'vitest';
import {
  encodeBootstrapAppVersionArgument,
  parseBootstrapAppVersionFromArgv,
} from '../bootstrapAppVersion';

describe('bootstrapAppVersion', () => {
  it('encodes and decodes the bootstrap app version argument', () => {
    const encoded = encodeBootstrapAppVersionArgument('1.2.3 beta+build');

    expect(encoded).toBe('--infilux-app-version=1.2.3%20beta%2Bbuild');
    expect(parseBootstrapAppVersionFromArgv(['--other-flag', encoded])).toBe('1.2.3 beta+build');
  });

  it('returns null when the app version argument is missing or empty after trimming', () => {
    expect(parseBootstrapAppVersionFromArgv(['--other-flag'])).toBeNull();
    expect(parseBootstrapAppVersionFromArgv(['--infilux-app-version=%20%20'])).toBeNull();
  });

  it('returns null when the encoded app version cannot be decoded', () => {
    expect(parseBootstrapAppVersionFromArgv(['--infilux-app-version=%E0%A4%A'])).toBeNull();
  });
});
