import { MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DiffReviewModalProps } from '@/components/source-control/DiffReviewModal';
import { Dialog, DialogHeader, DialogPopup, DialogTitle } from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';

type DiffReviewModalComponent = React.ComponentType<DiffReviewModalProps>;

interface DeferredDiffReviewModalProps extends DiffReviewModalProps {
  shouldLoad?: boolean;
}

export function DeferredDiffReviewModal({
  shouldLoad = true,
  open,
  onOpenChange,
  ...props
}: DeferredDiffReviewModalProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<DiffReviewModalComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/source-control/DiffReviewModal').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.DiffReviewModal as DiffReviewModalComponent);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Component]);

  if (Component) {
    return <Component open={open} onOpenChange={onOpenChange} {...props} />;
  }

  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Loading review')}</DialogTitle>
        </DialogHeader>
        <Empty className="border-0 py-6">
          <EmptyMedia variant="icon">
            <MessageSquare className="h-4.5 w-4.5" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t('Preparing review workspace')}</EmptyTitle>
            <EmptyDescription>{t('Loading comments and diff tools')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </DialogPopup>
    </Dialog>
  );
}
