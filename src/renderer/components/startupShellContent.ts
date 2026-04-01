export interface StartupShellCopy {
  description: string;
  title: string;
}

export function resolveStartupShellContent(stage: string | null | undefined): StartupShellCopy {
  switch (stage) {
    case 'importing-app':
      return {
        title: 'Loading shell',
        description: 'Preparing runtime modules and workspace services.',
      };
    case 'hydrating-local-storage':
      return {
        title: 'Restoring workspace',
        description: 'Loading settings and repository context.',
      };
    case 'hydration-complete':
    case 'rendering-root':
      return {
        title: 'Opening workspace',
        description: 'Restoring active context and preparing panels.',
      };
    case 'bootstrap-failed':
      return {
        title: 'Startup failed',
        description: 'The workspace did not finish loading. Check renderer logs and restart.',
      };
    default:
      return {
        title: 'Restoring workspace',
        description: 'Loading settings and repository context.',
      };
  }
}
