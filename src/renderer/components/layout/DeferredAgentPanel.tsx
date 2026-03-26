import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AgentPanelProps } from '@/components/chat/AgentPanel';
import { useI18n } from '@/i18n';
import { ControlStateCard } from './ControlStateCard';

type AgentPanelComponent = React.ComponentType<AgentPanelProps>;

interface DeferredAgentPanelProps extends AgentPanelProps {
  shouldLoad?: boolean;
}

export function DeferredAgentPanel({ shouldLoad = true, ...props }: DeferredAgentPanelProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<AgentPanelComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/chat/AgentPanel').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.AgentPanel as AgentPanelComponent);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Component]);

  if (Component) {
    return <Component {...props} />;
  }

  return (
    <ControlStateCard
      icon={<Sparkles className="h-5 w-5" />}
      eyebrow={t('Agent Console')}
      title={t('Loading AI Agent')}
      description={t('Preparing agent sessions and terminal workspace')}
    />
  );
}
