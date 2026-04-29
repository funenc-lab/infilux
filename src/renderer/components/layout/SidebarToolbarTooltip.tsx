import type { ReactNode } from 'react';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarToolbarTooltipProps {
  label: ReactNode;
  children: ReactNode;
}

export function SidebarToolbarTooltip({ label, children }: SidebarToolbarTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="control-sidebar-tooltip-trigger" />}>
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom" sideOffset={8} className="whitespace-nowrap">
        {label}
      </TooltipPopup>
    </Tooltip>
  );
}
