import type { ShellConfig } from '@shared/types';

export interface ResolvedCommandShell {
  shell: string;
  execArgs: string[];
}

function inferCustomShellExecArgs(
  shellPath: string,
  customShellArgs?: string[]
): ResolvedCommandShell['execArgs'] {
  const shellName = shellPath.split(/[/\\]/).pop()?.toLowerCase() || '';

  if (shellName.includes('pwsh')) {
    return ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Login', '-Command'];
  }
  if (shellName.includes('powershell')) {
    return ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'];
  }
  if (shellName === 'cmd.exe' || shellName === 'cmd') {
    return ['/c'];
  }
  if (shellName.includes('bash') || shellName.includes('zsh')) {
    return ['-l', '-c'];
  }
  if (shellName.includes('fish') || shellName === 'nu' || shellName.includes('nushell')) {
    return ['-l', '-c'];
  }

  if (customShellArgs?.length) {
    return [...customShellArgs, '-c'];
  }

  return ['-c'];
}

export function resolveFallbackCommandShell(
  platform: 'darwin' | 'linux' | 'win32' | undefined,
  config: ShellConfig
): ResolvedCommandShell {
  if (config.shellType === 'custom') {
    const shell =
      config.customShellPath?.trim() || (platform === 'win32' ? 'powershell.exe' : '/bin/sh');
    return {
      shell,
      execArgs: inferCustomShellExecArgs(shell, config.customShellArgs),
    };
  }

  if (platform === 'win32') {
    switch (config.shellType) {
      case 'powershell7':
        return {
          shell: 'pwsh.exe',
          execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Login', '-Command'],
        };
      case 'powershell':
        return {
          shell: 'powershell.exe',
          execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'],
        };
      case 'cmd':
        return {
          shell: 'cmd.exe',
          execArgs: ['/c'],
        };
      case 'gitbash':
        return {
          shell: 'bash.exe',
          execArgs: ['-i', '-l', '-c'],
        };
      case 'nushell':
        return {
          shell: 'nu.exe',
          execArgs: ['-l', '-c'],
        };
      case 'wsl':
        return {
          shell: 'wsl.exe',
          execArgs: ['--', 'bash', '-ilc'],
        };
      default:
        return {
          shell: 'powershell.exe',
          execArgs: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command'],
        };
    }
  }

  switch (config.shellType) {
    case 'zsh':
      return {
        shell: '/bin/zsh',
        execArgs: ['-l', '-c'],
      };
    case 'bash':
      return {
        shell: '/bin/bash',
        execArgs: ['-l', '-c'],
      };
    case 'fish':
      return {
        shell: '/usr/bin/fish',
        execArgs: ['-l', '-c'],
      };
    case 'nushell':
      return {
        shell: '/usr/local/bin/nu',
        execArgs: ['-l', '-c'],
      };
    case 'sh':
      return {
        shell: '/bin/sh',
        execArgs: ['-c'],
      };
    case 'system':
    default:
      return {
        shell: '/bin/sh',
        execArgs: ['-c'],
      };
  }
}
