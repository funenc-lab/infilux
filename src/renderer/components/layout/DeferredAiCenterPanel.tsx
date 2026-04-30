import { BrainCircuit } from 'lucide-react';
import type { AiCenterPanelProps } from '@/components/ai-center/AiCenterPanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { DeferredPanelLoadError } from './DeferredPanelLoadError';
import { useDeferredComponentLoader } from './useDeferredComponentLoader';
import { useDeferredReady } from './useDeferredReady';

type AiCenterPanelComponent = React.ComponentType<AiCenterPanelProps>;
type AiCenterPanelModule = typeof import('@/components/ai-center/AiCenterPanel');

function loadAiCenterPanelModule(): Promise<AiCenterPanelModule> {
  return import('@/components/ai-center/AiCenterPanel');
}

function selectAiCenterPanelComponent(module: AiCenterPanelModule): AiCenterPanelComponent {
  return module.AiCenterPanel as AiCenterPanelComponent;
}

interface DeferredAiCenterPanelProps extends AiCenterPanelProps {
  shouldLoad?: boolean;
  onReady?: () => void;
}

export function DeferredAiCenterPanel({
  shouldLoad = true,
  onReady,
  ...props
}: DeferredAiCenterPanelProps) {
  const { t } = useI18n();
  const { Component, error, retry } = useDeferredComponentLoader<
    AiCenterPanelModule,
    AiCenterPanelProps
  >({
    shouldLoad,
    load: loadAiCenterPanelModule,
    selectComponent: selectAiCenterPanelComponent,
    errorLabel: 'AiCenterPanel',
  });

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...props} />;
  }

  if (error) {
    return (
      <DeferredPanelLoadError
        eyebrow={t('AI Center')}
        title={t('Unable to load AI Center')}
        description={t('Unable to load resources.')}
        error={error}
        onRetry={retry}
      />
    );
  }

  return (
    <DeferredPanelFallback
      icon={<BrainCircuit className="h-5 w-5" />}
      eyebrow={t('AI Center')}
      title={t('AI Center')}
      description={t('Loading AI Center')}
    />
  );
}
