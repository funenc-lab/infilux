import type { SessionCreateOptions } from '@shared/types';

function containsResumeArgument(args: string[] | undefined): boolean {
  return args?.some((arg) => arg.trim().toLowerCase() === 'resume') ?? false;
}

function containsCodexResumeCommand(command: string | undefined): boolean {
  if (!command) {
    return false;
  }

  return /\bcodex(?:\.(?:exe|cmd|bat))?\b[\s\S]{0,512}\bresume\b/i.test(command);
}

export function shouldShareCodexSessionHistory(options: SessionCreateOptions): boolean {
  return (
    containsResumeArgument(options.args) ||
    containsResumeArgument(options.fallbackArgs) ||
    containsCodexResumeCommand(options.initialCommand) ||
    containsCodexResumeCommand(options.shell) ||
    (options.args?.some(containsCodexResumeCommand) ?? false) ||
    (options.fallbackArgs?.some(containsCodexResumeCommand) ?? false)
  );
}
