import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AgentPanelProps } from '@/components/chat/AgentPanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredReady } from './useDeferredReady';

type AgentPanelComponent = React.ComponentType<AgentPanelProps>;

let cachedAgentPanelComponent: AgentPanelComponent | null = null;
let agentPanelComponentPromise: Promise<AgentPanelComponent> | null = null;

function loadAgentPanelComponent(): Promise<AgentPanelComponent> {
  if (cachedAgentPanelComponent) {
    return Promise.resolve(cachedAgentPanelComponent);
  }

  agentPanelComponentPromise ??= import('@/components/chat/AgentPanel')
    .then((module) => {
      cachedAgentPanelComponent = module.AgentPanel as AgentPanelComponent;
      return cachedAgentPanelComponent;
    })
    .catch((error: unknown) => {
      agentPanelComponentPromise = null;
      throw error;
    });

  return agentPanelComponentPromise;
}

interface DeferredAgentPanelProps extends AgentPanelProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
  onReady?: () => void;
}

export function DeferredAgentPanel({
  shouldLoad = true,
  showFallback = true,
  onReady,
  ...props
}: DeferredAgentPanelProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<AgentPanelComponent | null>(
    () => cachedAgentPanelComponent
  );

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    loadAgentPanelComponent()
      .then((LoadedComponent) => {
        if (cancelled) {
          return;
        }
        setComponent(() => LoadedComponent);
      })
      .catch((error: unknown) => {
        console.error('[DeferredAgentPanel] Failed to load AgentPanel', error);
      });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Component]);

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...props} />;
  }

  if (!showFallback) {
    return null;
  }

  return (
    <DeferredPanelFallback
      icon={<Sparkles className="h-5 w-5" />}
      eyebrow={t('Agent Console')}
      title={t('Loading AI Agent')}
      description={t('Preparing agent sessions and terminal workspace')}
    />
  );
}
