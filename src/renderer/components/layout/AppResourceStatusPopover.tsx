import { Gauge } from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { AppResourceManagerDrawer } from './AppResourceManagerDrawer';

interface AppResourceStatusPopoverProps {
  className?: string;
}

export function AppResourceStatusPopover({ className }: AppResourceStatusPopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(className)}
        aria-label={t('App runtime status')}
        title={t('App runtime status')}
      >
        <Gauge className="h-3.5 w-3.5" />
      </SheetTrigger>
      <AppResourceManagerDrawer open={open} />
    </Sheet>
  );
}
