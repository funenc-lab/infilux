import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cliDetectorTestDoubles = vi.hoisted(() => {
  const execInPty = vi.fn();

  function reset() {
    execInPty.mockReset();
  }

  return {
    execInPty,
    reset,
  };
});

vi.mock('../../../utils/shell', () => ({
  execInPty: cliDetectorTestDoubles.execInPty,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

describe('CliDetector', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cliDetectorTestDoubles.reset();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('detects builtin CLIs and parses versions using custom paths', async () => {
    setPlatform('darwin');
    cliDetectorTestDoubles.execInPty.mockResolvedValueOnce('claude 1.2.3');

    const { cliDetector } = await import('../CliDetector');
    const result = await cliDetector.detectOne('claude', undefined, '/custom/bin/claude');

    expect(result).toEqual({
      id: 'claude',
      name: 'Claude',
      command: 'claude',
      installed: true,
      version: '1.2.3',
      isBuiltin: true,
      environment: 'native',
    });
    expect(cliDetectorTestDoubles.execInPty).toHaveBeenCalledWith('/custom/bin/claude --version', {
      timeout: 15000,
    });
  });

  it('marks builtin detection timeouts on Windows', async () => {
    setPlatform('win32');
    cliDetectorTestDoubles.execInPty.mockRejectedValueOnce(new Error('Detection timeout'));

    const { cliDetector } = await import('../CliDetector');
    const result = await cliDetector.detectOne('codex');

    expect(result).toEqual({
      id: 'codex',
      name: 'Codex',
      command: 'codex',
      installed: false,
      isBuiltin: true,
      timedOut: true,
    });
    expect(cliDetectorTestDoubles.execInPty).toHaveBeenCalledWith('codex --version', {
      timeout: 60000,
    });
  });

  it('detects custom agents and falls back for unknown agents', async () => {
    setPlatform('linux');
    cliDetectorTestDoubles.execInPty.mockResolvedValueOnce('custom-agent v9.8.7');

    const { cliDetector } = await import('../CliDetector');

    expect(
      await cliDetector.detectOne('custom-agent', {
        id: 'custom-agent',
        name: 'Custom Agent',
        command: 'custom-agent',
      })
    ).toEqual({
      id: 'custom-agent',
      name: 'Custom Agent',
      command: 'custom-agent',
      installed: true,
      version: '9.8.7',
      isBuiltin: false,
      environment: 'native',
    });

    expect(await cliDetector.detectOne('unknown-agent')).toEqual({
      id: 'unknown-agent',
      name: 'unknown-agent',
      command: 'unknown-agent',
      installed: false,
      isBuiltin: false,
    });
    expect(cliDetectorTestDoubles.execInPty).toHaveBeenCalledWith('custom-agent --version', {
      timeout: 15000,
    });
  });

  it('marks custom agent failures as timed out only for timeout errors', async () => {
    setPlatform('linux');
    cliDetectorTestDoubles.execInPty.mockRejectedValueOnce(new Error('spawn failed'));

    const { cliDetector } = await import('../CliDetector');
    const result = await cliDetector.detectOne('custom-agent', {
      id: 'custom-agent',
      name: 'Custom Agent',
      command: 'custom-agent',
    });

    expect(result).toEqual({
      id: 'custom-agent',
      name: 'Custom Agent',
      command: 'custom-agent',
      installed: false,
      isBuiltin: false,
      timedOut: false,
    });
  });
});
