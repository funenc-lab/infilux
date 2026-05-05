import { Check, Minus } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type {
  AgentIntegrationCapabilityCoverageTone,
  AgentIntegrationCapabilityModel,
} from './agentIntegrationCapabilityModel';

interface AgentCapabilityCoveragePanelProps {
  model: AgentIntegrationCapabilityModel;
}

function resolveCoverageToneLabelKey(tone: AgentIntegrationCapabilityCoverageTone): string {
  if (tone === 'complete') {
    return 'Full coverage';
  }

  return tone === 'partial' ? 'Partial coverage' : 'No coverage';
}

function resolveCoverageToneBadgeClassName(tone: AgentIntegrationCapabilityCoverageTone): string {
  if (tone === 'complete') {
    return 'control-badge control-badge-success';
  }

  return tone === 'partial' ? 'control-badge control-badge-warning' : 'control-badge';
}

function resolveCoverageBarClassName(tone: AgentIntegrationCapabilityCoverageTone): string {
  if (tone === 'complete') {
    return 'bg-success/70';
  }

  return tone === 'partial' ? 'bg-warning/70' : 'bg-muted-foreground/35';
}

export function AgentCapabilityCoveragePanel({ model }: AgentCapabilityCoveragePanelProps) {
  const { t } = useI18n();

  return (
    <div className="control-panel-muted space-y-3 rounded-lg p-3">
      <div className="space-y-1">
        <div className="min-w-0 space-y-1">
          <h4 className="text-sm font-medium">{t('Agent capability coverage')}</h4>
          <p className="max-w-[72ch] text-xs text-muted-foreground">
            {t(
              'These controls use provider capabilities instead of assuming every AI tool supports the same hooks.'
            )}
          </p>
        </div>
      </div>

      <div
        aria-label={t('Provider coverage summary')}
        className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"
        role="list"
      >
        {model.providerCoverages.map((coverage) => {
          const capabilityCountLabel = t('{{supported}}/{{total}} capabilities', {
            supported: coverage.supportedCapabilityCount,
            total: coverage.totalCapabilityCount,
          });
          const gapLabel =
            coverage.unsupportedCapabilityCount === 0
              ? t('No gaps')
              : t('{{count}} gaps', { count: coverage.unsupportedCapabilityCount });

          return (
            <div
              key={coverage.providerId}
              className="min-w-0 rounded-md border border-border/70 bg-background/38 px-2.5 py-2"
              role="listitem"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">
                  {coverage.label}
                </span>
                <span className={resolveCoverageToneBadgeClassName(coverage.tone)}>
                  {t(resolveCoverageToneLabelKey(coverage.tone))}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {capabilityCountLabel}
                </span>
                <span className="text-xs text-muted-foreground">{gapLabel}</span>
              </div>
              <div
                aria-label={`${coverage.label}: ${capabilityCountLabel}`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={coverage.coveragePercent}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/42"
                role="progressbar"
              >
                <div
                  className={cn('h-full rounded-full', resolveCoverageBarClassName(coverage.tone))}
                  style={{ width: `${coverage.coveragePercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-md border border-border/70 bg-background/35">
        <table
          aria-label={t('Capability coverage matrix')}
          className="w-full min-w-[760px] border-collapse text-xs"
        >
          <thead>
            <tr className="border-border/70 border-b bg-muted/35 text-muted-foreground">
              <th className="w-[42%] px-3 py-2 text-left font-medium" scope="col">
                {t('Capability')}
              </th>
              <th className="px-2 py-2 text-left font-medium" scope="col">
                {t('Coverage')}
              </th>
              {model.providers.map((provider) => (
                <th
                  key={provider.providerId}
                  className="px-2 py-2 text-center font-medium"
                  scope="col"
                >
                  {provider.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.capabilities.map((capability) => (
              <tr key={capability.id} className="border-border/60 border-b last:border-b-0">
                <th className="px-3 py-2.5 text-left align-top font-normal" scope="row">
                  <span className="block text-xs font-medium text-foreground">
                    {t(capability.titleKey)}
                  </span>
                  <span className="mt-1 block max-w-[54ch] text-muted-foreground">
                    {t(capability.descriptionKey)}
                  </span>
                </th>
                <td className="px-2 py-2.5 align-top">
                  <span className="control-badge">
                    {t('{{supported}}/{{total}} providers', {
                      supported: capability.supportedProviderCount,
                      total: model.providers.length,
                    })}
                  </span>
                </td>
                {capability.providerStatuses.map((status) => {
                  const statusLabel = status.supported ? t('Supported') : t('Adapter pending');

                  return (
                    <td key={status.providerId} className="px-2 py-2.5 text-center align-top">
                      <span
                        aria-label={`${status.label}: ${statusLabel}`}
                        className={cn(
                          'inline-flex h-6 w-6 items-center justify-center rounded-md border',
                          status.supported
                            ? 'border-success/28 bg-success/10 text-success-foreground'
                            : 'border-border/70 bg-muted/25 text-muted-foreground'
                        )}
                        role="img"
                        title={`${status.label}: ${statusLabel}`}
                      >
                        {status.supported ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Minus className="h-3.5 w-3.5" />
                        )}
                        <span className="sr-only">{statusLabel}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
