import { Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SettingsContentProps } from '@/components/settings/SettingsContent';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredReady } from './useDeferredReady';

type SettingsContentComponent = React.ComponentType<SettingsContentProps>;

interface DeferredSettingsContentProps extends SettingsContentProps {
  shouldLoad?: boolean;
  onReady?: () => void;
}

export function DeferredSettingsContent({
  shouldLoad = true,
  onReady,
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

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...props} />;
  }

  return (
    <DeferredPanelFallback
      icon={<Settings className="h-5 w-5" />}
      eyebrow={t('Settings')}
      title={t('Loading settings')}
      description={t('Preparing preferences and configuration panels')}
    />
  );
}
