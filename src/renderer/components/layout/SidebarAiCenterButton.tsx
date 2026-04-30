import { BrainCircuit } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { SidebarToolbarTooltip } from './SidebarToolbarTooltip';

type SidebarToolbarTooltipProps = ComponentProps<typeof SidebarToolbarTooltip>;

interface SidebarAiCenterButtonProps {
  active?: boolean;
  className?: string;
  onSelect?: () => void;
  tooltipAlign?: SidebarToolbarTooltipProps['align'];
  tooltipSide?: SidebarToolbarTooltipProps['side'];
  tooltipSideOffset?: SidebarToolbarTooltipProps['sideOffset'];
}

export function SidebarAiCenterButton({
  active = false,
  className,
  onSelect,
  tooltipAlign,
  tooltipSide,
  tooltipSideOffset,
}: SidebarAiCenterButtonProps) {
  const { t } = useI18n();
  const label = t('AI Center');

  return (
    <SidebarToolbarTooltip
      label={label}
      side={tooltipSide}
      align={tooltipAlign}
      sideOffset={tooltipSideOffset}
    >
      <button
        type="button"
        className={cn('control-sidebar-toolbutton no-drag', className)}
        aria-label={label}
        aria-pressed={active}
        title={label}
        data-state={active ? 'active' : 'idle'}
        disabled={!onSelect}
        onClick={onSelect}
      >
        <BrainCircuit className="h-3.5 w-3.5" />
      </button>
    </SidebarToolbarTooltip>
  );
}
