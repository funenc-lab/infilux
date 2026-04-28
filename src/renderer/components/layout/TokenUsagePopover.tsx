import { ChartNoAxesColumnIncreasing } from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { TokenUsageDrawer } from './TokenUsageDrawer';

interface TokenUsagePopoverProps {
  className?: string;
}

export function TokenUsagePopover({ className }: TokenUsagePopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(className)}
        aria-label={t('Token Usage')}
        title={t('Token Usage')}
      >
        <ChartNoAxesColumnIncreasing className="h-3.5 w-3.5" />
        <span aria-hidden="true" className="sr-only ui-type-panel-description">
          {t('Token Usage')}
        </span>
      </SheetTrigger>
      <TokenUsageDrawer open={open} />
    </Sheet>
  );
}
