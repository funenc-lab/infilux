import { forwardRef, useEffect, useState } from 'react';
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

    if (!shouldLoad) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t('Open a file to start editing')}
        </div>
      );
    }

    if (!EditorAreaComponent) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t('Loading editor')}
        </div>
      );
    }

    return <EditorAreaComponent ref={ref} {...props} />;
  }
);
