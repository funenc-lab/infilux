import { Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TerminalPanelProps } from '@/components/terminal/TerminalPanel';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';

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
    <Empty className="h-full border-0">
      <EmptyMedia variant="icon">
        <Terminal className="h-4.5 w-4.5" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t('Loading terminal')}</EmptyTitle>
        <EmptyDescription>{t('Preparing shell sessions and terminal workspace')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
