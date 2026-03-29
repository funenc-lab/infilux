import { FileCode } from 'lucide-react';
import type { CurrentFilePanelProps } from '@/components/files/CurrentFilePanel';
import { CurrentFilePanel } from '@/components/files/CurrentFilePanel';
import { useI18n } from '@/i18n';
import { ControlStateCard } from './ControlStateCard';

interface DeferredCurrentFilePanelProps extends CurrentFilePanelProps {
  shouldLoad?: boolean;
}

export function DeferredCurrentFilePanel(props: DeferredCurrentFilePanelProps) {
  const { t } = useI18n();
  const { shouldLoad, ...panelProps } = props;
  const shouldRenderPanel = shouldLoad ?? true;

  if (shouldRenderPanel) {
    return <CurrentFilePanel {...panelProps} />;
  }

  return (
    <ControlStateCard
      icon={<FileCode className="h-5 w-5" />}
      eyebrow={t('File Explorer')}
      title={t('Loading editor')}
      description={t('Preparing active file workspace')}
    />
  );
}
