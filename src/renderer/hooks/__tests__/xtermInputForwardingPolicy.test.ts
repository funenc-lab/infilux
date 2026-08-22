import { describe, expect, it } from 'vitest';
import { shouldForwardXtermInput } from '../xtermInputForwardingPolicy';

describe('shouldForwardXtermInput', () => {
  it('blocks standard terminal responses while applying backend output', () => {
    expect(
      shouldForwardXtermInput('\x1b[>0;276;0c', {
        isApplyingBackendOutput: true,
      })
    ).toBe(false);
    expect(
      shouldForwardXtermInput('\x1bP>|xterm.js(6.1.0-beta.141)\x1b\\', {
        isApplyingBackendOutput: true,
      })
    ).toBe(false);
    expect(
      shouldForwardXtermInput('\x1b]10;rgb:ffff/ffff/ffff\x07', {
        isApplyingBackendOutput: true,
      })
    ).toBe(false);
    expect(
      shouldForwardXtermInput('\x1b[?2026;1$y', {
        isApplyingBackendOutput: true,
      })
    ).toBe(false);
  });

  it('forwards normal input while applying backend output', () => {
    expect(
      shouldForwardXtermInput('npm test\r', {
        isApplyingBackendOutput: true,
      })
    ).toBe(true);
    expect(
      shouldForwardXtermInput('\x1b[A', {
        isApplyingBackendOutput: true,
      })
    ).toBe(true);
  });

  it('does not truncate mixed input that only contains a terminal response prefix', () => {
    const input = '\x1b[>0;276;0c user text';

    expect(
      shouldForwardXtermInput(input, {
        isApplyingBackendOutput: true,
      })
    ).toBe(true);
  });

  it('forwards input when backend output is idle', () => {
    expect(
      shouldForwardXtermInput('\x1b[>0;276;0c', {
        isApplyingBackendOutput: false,
      })
    ).toBe(true);
  });
});
