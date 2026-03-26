import { Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TerminalPanelProps } from '@/components/terminal/TerminalPanel';
import { useI18n } from '@/i18n';
import { ControlStateCard } from './ControlStateCard';

type TerminalPanelComponent = React.ComponentType<TerminalPanelProps>;

interface DeferredTerminalPanelProps extends TerminalPanelProps {
  shouldLoad?: boolean;
}

export function DeferredTerminalPanel({ shouldLoad = true, ...props }: DeferredTerminalPanelProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<TerminalPanelComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/terminal/TerminalPanel').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.TerminalPanel as TerminalPanelComponent);
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
      icon={<Terminal className="h-5 w-5" />}
      eyebrow={t('Terminal Console')}
      title={t('Loading terminal')}
      description={t('Preparing shell sessions and terminal workspace')}
    />
  );
}
