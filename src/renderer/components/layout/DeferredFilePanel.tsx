import { FileCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FilePanelProps } from '@/components/files/FilePanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredReady } from './useDeferredReady';

type FilePanelComponent = React.ComponentType<FilePanelProps>;

interface DeferredFilePanelProps extends FilePanelProps {
  shouldLoad?: boolean;
  showFallback?: boolean;
  onReady?: () => void;
}

export function DeferredFilePanel({
  shouldLoad = true,
  showFallback = true,
  onReady,
  ...panelProps
}: DeferredFilePanelProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<FilePanelComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/files/FilePanel').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.FilePanel as FilePanelComponent);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Component]);

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...panelProps} />;
  }

  if (!showFallback) {
    return null;
  }

  return (
    <DeferredPanelFallback
      icon={<FileCode className="h-5 w-5" />}
      eyebrow={t('File Explorer')}
      title={t('Loading file explorer')}
      description={t('Preparing file tree and editor workspace')}
    />
  );
}
