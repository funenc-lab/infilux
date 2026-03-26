import { Settings } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPopup, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useKeybindingInterceptor } from '@/hooks/useKeybindingInterceptor';
import { useI18n } from '@/i18n';
import type { SettingsCategory } from './constants';
import { SettingsShell } from './SettingsShell';

interface SettingsDialogProps {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Initial category to show when dialog opens */
  initialCategory?: SettingsCategory;
  /** Scroll to Claude Provider section (only works with integration category) */
  scrollToProvider?: boolean;
}

export function SettingsDialog({
  trigger,
  open,
  onOpenChange,
  initialCategory,
  scrollToProvider,
}: SettingsDialogProps) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = React.useState<SettingsCategory>(
    initialCategory ?? 'general'
  );
  const [internalOpen, setInternalOpen] = React.useState(false);

  // Update active category when initialCategory changes and dialog opens
  React.useEffect(() => {
    if (open && initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [open, initialCategory]);

  // Controlled mode (open prop provided) doesn't need trigger
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (isControlled) {
        onOpenChange?.(newOpen);
      } else {
        setInternalOpen(newOpen);
      }
    },
    [isControlled, onOpenChange]
  );

  const handleClose = React.useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  // Intercept close tab keybinding when dialog is open
  useKeybindingInterceptor(isOpen, 'closeTab', handleClose);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button variant="ghost" size="icon" className="control-icon-button rounded-xl">
                <Settings className="h-4 w-4" />
              </Button>
            )
          }
        />
      )}
      <DialogPopup
        className="overflow-hidden border-border/70 bg-background/95 sm:max-w-5xl"
        showCloseButton={true}
        disableNestedTransform
      >
        <div className="flex items-center border-b px-5 py-3.5">
          <DialogTitle className="min-w-0 truncate text-lg font-medium">
            {t('Settings')}
          </DialogTitle>
        </div>
        <SettingsShell
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          scrollToProvider={scrollToProvider}
          className="h-[min(640px,calc(100dvh-7rem))]"
          contentClassName="p-5"
        />
      </DialogPopup>
    </Dialog>
  );
}
