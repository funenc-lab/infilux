import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AgentPanelProps } from '@/components/chat/AgentPanel';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';

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
    <Empty className="h-full border-0">
      <EmptyMedia variant="icon">
        <Sparkles className="h-4.5 w-4.5" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t('Loading AI Agent')}</EmptyTitle>
        <EmptyDescription>{t('Preparing agent sessions and terminal workspace')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
