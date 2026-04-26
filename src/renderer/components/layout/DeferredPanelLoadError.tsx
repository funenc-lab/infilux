import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n';
import { ControlStateActionButton } from './ControlStateActionButton';
import { ControlStateCard } from './ControlStateCard';

interface DeferredPanelLoadErrorProps {
  eyebrow: string;
  title: string;
  description: string;
  error: Error;
  onRetry: () => void;
}

export function DeferredPanelLoadError({
  eyebrow,
  title,
  description,
  error,
  onRetry,
}: DeferredPanelLoadErrorProps) {
  const { t } = useI18n();

  return (
    <ControlStateCard
      icon={<AlertTriangle className="h-5 w-5" />}
      eyebrow={eyebrow}
      title={title}
      description={description}
      metaLabel={t('Error')}
      metaValue={error.message}
      actions={
        <ControlStateActionButton onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('Retry')}
        </ControlStateActionButton>
      }
    />
  );
}
