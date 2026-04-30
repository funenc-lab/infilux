import type { ComponentProps, ReactNode } from 'react';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';

type TooltipPopupProps = ComponentProps<typeof TooltipPopup>;

interface SidebarToolbarTooltipProps {
  label: ReactNode;
  shortcut?: ReactNode;
  side?: TooltipPopupProps['side'];
  align?: TooltipPopupProps['align'];
  sideOffset?: TooltipPopupProps['sideOffset'];
  children: ReactNode;
}

export function SidebarToolbarTooltip({
  label,
  shortcut,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  children,
}: SidebarToolbarTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="control-sidebar-tooltip-trigger" />}>
        {children}
      </TooltipTrigger>
      <TooltipPopup side={side} align={align} sideOffset={sideOffset} className="whitespace-nowrap">
        <span className="control-sidebar-tooltip-content">
          <span>{label}</span>
          {shortcut ? <kbd className="control-sidebar-tooltip-shortcut">{shortcut}</kbd> : null}
        </span>
      </TooltipPopup>
    </Tooltip>
  );
}
