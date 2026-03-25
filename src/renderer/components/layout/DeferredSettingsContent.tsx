import { Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SettingsContentProps } from '@/components/settings/SettingsContent';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';

type SettingsContentComponent = React.ComponentType<SettingsContentProps>;

interface DeferredSettingsContentProps extends SettingsContentProps {
  shouldLoad?: boolean;
}

export function DeferredSettingsContent({
  shouldLoad = true,
  ...props
}: DeferredSettingsContentProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<SettingsContentComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/settings/SettingsContent').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.SettingsContent as SettingsContentComponent);
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
        <Settings className="h-4.5 w-4.5" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t('Loading settings')}</EmptyTitle>
        <EmptyDescription>{t('Preparing preferences and configuration panels')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
