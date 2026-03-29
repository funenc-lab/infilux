import { FileCode } from 'lucide-react';
import type { FilePanelProps } from '@/components/files/FilePanel';
import { FilePanel } from '@/components/files/FilePanel';
import { useI18n } from '@/i18n';
import { ControlStateCard } from './ControlStateCard';

interface DeferredFilePanelProps extends FilePanelProps {
  shouldLoad?: boolean;
}

export function DeferredFilePanel(props: DeferredFilePanelProps) {
  const { t } = useI18n();
  const { shouldLoad, ...panelProps } = props;
  const shouldRenderPanel = shouldLoad ?? true;

  if (shouldRenderPanel) {
    return <FilePanel {...panelProps} />;
  }

  return (
    <ControlStateCard
      icon={<FileCode className="h-5 w-5" />}
      eyebrow={t('File Explorer')}
      title={t('Loading file explorer')}
      description={t('Preparing file tree and editor workspace')}
    />
  );
}
