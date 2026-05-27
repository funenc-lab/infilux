interface BuildShellCommandFromExecutablePathParams {
  shellPath: string;
  executionPlatform?: string;
  executablePath: string;
  rawArgs?: string[];
}

const POWERSHELL_SAFE_COMMAND_PATTERN = /^[A-Za-z0-9._-]+$/u;
const POSIX_SAFE_COMMAND_PATTERN = /^[A-Za-z0-9_./:@%+=,-]+$/u;
const WINDOWS_SAFE_COMMAND_PATTERN = /^[^"\s&|<>^()%!]+$/u;

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteWindows(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function isPowerShellShell(shellPath: string): boolean {
  const normalizedShellPath = shellPath.toLowerCase();
  return normalizedShellPath.includes('powershell') || normalizedShellPath.includes('pwsh');
}

function isPosixLikeShell(shellPath: string): boolean {
  const normalizedShellPath = shellPath.toLowerCase();
  return (
    normalizedShellPath.includes('wsl') ||
    normalizedShellPath.includes('bash') ||
    normalizedShellPath.includes('zsh') ||
    normalizedShellPath.includes('fish') ||
    normalizedShellPath.endsWith('/sh') ||
    normalizedShellPath.endsWith('\\sh.exe')
  );
}

/**
 * Build a shell-safe command string for an executable path.
 * rawArgs must already be safe to concatenate for the target shell.
 */
export function buildShellCommandFromExecutablePath({
  shellPath,
  executionPlatform,
  executablePath,
  rawArgs = [],
}: BuildShellCommandFromExecutablePathParams): string {
  const argsSuffix = rawArgs.length > 0 ? ` ${rawArgs.join(' ')}` : '';

  if (isPowerShellShell(shellPath)) {
    if (POWERSHELL_SAFE_COMMAND_PATTERN.test(executablePath)) {
      return `${executablePath}${argsSuffix}`;
    }
    return `& ${quotePowerShell(executablePath)}${argsSuffix}`;
  }

  if (isPosixLikeShell(shellPath) || executionPlatform !== 'win32') {
    const command = POSIX_SAFE_COMMAND_PATTERN.test(executablePath)
      ? executablePath
      : quotePosix(executablePath);
    return `${command}${argsSuffix}`;
  }

  const command = WINDOWS_SAFE_COMMAND_PATTERN.test(executablePath)
    ? executablePath
    : quoteWindows(executablePath);
  return `${command}${argsSuffix}`;
}
