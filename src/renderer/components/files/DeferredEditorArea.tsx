import { forwardRef } from 'react';
import { useI18n } from '@/i18n';
import type { EditorAreaProps, EditorAreaRef } from './EditorArea';
import { EditorArea } from './EditorArea';

interface DeferredEditorAreaProps extends EditorAreaProps {
  shouldLoad?: boolean;
}

export const DeferredEditorArea = forwardRef<EditorAreaRef, DeferredEditorAreaProps>(
  function DeferredEditorArea({ shouldLoad = true, ...props }, ref) {
    const { t } = useI18n();

    if (!shouldLoad) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t('Open a file to start editing')}
        </div>
      );
    }

    return <EditorArea ref={ref} {...props} />;
  }
);
