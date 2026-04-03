import { type Locale, translate } from '@shared/i18n';

export interface StartupShellCopy {
  description: string;
  progressLabel: string;
  progressMax: number;
  progressValue: number;
  title: string;
}

interface StartupShellCopyTemplate {
  description: string;
  progressLabel: string;
  progressMax: number;
  progressValue: number;
  title: string;
}

function resolveStartupShellTemplate(stage: string | null | undefined): StartupShellCopyTemplate {
  switch (stage) {
    case 'module-evaluated':
    case 'start-app-entered':
    case 'rendering-startup-shell':
    case 'startup-shell-rendered':
      return {
        title: 'Loading shell',
        description: 'Preparing runtime modules and workspace services.',
        progressLabel: 'Loading shell',
        progressValue: 1,
        progressMax: 4,
      };
    case 'importing-app':
      return {
        title: 'Loading shell',
        description: 'Preparing runtime modules and workspace services.',
        progressLabel: 'Loading shell',
        progressValue: 2,
        progressMax: 4,
      };
    case 'hydrating-local-storage':
      return {
        title: 'Restoring workspace',
        description: 'Loading settings and repository context.',
        progressLabel: 'Restoring workspace',
        progressValue: 3,
        progressMax: 4,
      };
    case 'hydration-complete':
    case 'rendering-root':
    case 'render-dispatched':
      return {
        title: 'Opening workspace',
        description: 'Restoring active context and preparing panels.',
        progressLabel: 'Opening workspace',
        progressValue: 4,
        progressMax: 4,
      };
    case 'bootstrap-failed':
      return {
        title: 'Startup failed',
        description: 'The workspace did not finish loading. Check renderer logs and restart.',
        progressLabel: 'Startup failed',
        progressValue: 4,
        progressMax: 4,
      };
    default:
      return {
        title: 'Restoring workspace',
        description: 'Loading settings and repository context.',
        progressLabel: 'Restoring workspace',
        progressValue: 1,
        progressMax: 4,
      };
  }
}

export function resolveStartupShellContent(
  stage: string | null | undefined,
  locale: Locale = 'en'
): StartupShellCopy {
  const template = resolveStartupShellTemplate(stage);
  return {
    title: translate(locale, template.title),
    description: translate(locale, template.description),
    progressLabel: translate(locale, template.progressLabel),
    progressMax: template.progressMax,
    progressValue: template.progressValue,
  };
}
