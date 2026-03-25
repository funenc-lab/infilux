import { FileCode } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';
import type { EditorAreaProps, EditorAreaRef } from './EditorArea';

type EditorAreaComponent = React.ComponentType<
  EditorAreaProps & React.RefAttributes<EditorAreaRef>
>;

interface DeferredEditorAreaProps extends EditorAreaProps {
  shouldLoad?: boolean;
}

export const DeferredEditorArea = forwardRef<EditorAreaRef, DeferredEditorAreaProps>(
  function DeferredEditorArea({ shouldLoad = true, ...props }, ref) {
    const { t } = useI18n();
    const [EditorAreaComponent, setEditorAreaComponent] = useState<EditorAreaComponent | null>(
      null
    );

    useEffect(() => {
      if (!shouldLoad || EditorAreaComponent) {
        return;
      }

      let cancelled = false;
      import('./EditorArea').then((module) => {
        if (cancelled) {
          return;
        }
        setEditorAreaComponent(() => module.EditorArea as EditorAreaComponent);
      });

      return () => {
        cancelled = true;
      };
    }, [shouldLoad, EditorAreaComponent]);

    if (EditorAreaComponent) {
      return <EditorAreaComponent ref={ref} {...props} />;
    }

    if (!shouldLoad) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t('Open a file to start editing')}
        </div>
      );
    }

    return (
      <Empty className="h-full border-0">
        <EmptyMedia variant="icon">
          <FileCode className="h-4.5 w-4.5" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{t('Loading editor')}</EmptyTitle>
          <EmptyDescription>{t('Preparing the editor runtime')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
);
