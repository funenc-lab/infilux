import { describe, expect, it } from 'vitest';
import { buildShellCommandFromExecutablePath } from '../shellCommand';

describe('buildShellCommandFromExecutablePath', () => {
  it('quotes executable paths for PowerShell shells', () => {
    expect(
      buildShellCommandFromExecutablePath({
        shellPath: 'powershell.exe',
        executionPlatform: 'win32',
        executablePath: 'C:\\Program Files\\OpenAI\\codex.exe',
        rawArgs: ['--version'],
      })
    ).toBe("& 'C:\\Program Files\\OpenAI\\codex.exe' --version");
  });

  it('quotes executable paths for POSIX shells', () => {
    expect(
      buildShellCommandFromExecutablePath({
        shellPath: '/bin/bash',
        executionPlatform: 'linux',
        executablePath: '/opt/Open AI/bin/codex',
        rawArgs: ['--version'],
      })
    ).toBe("'/opt/Open AI/bin/codex' --version");
  });
});
