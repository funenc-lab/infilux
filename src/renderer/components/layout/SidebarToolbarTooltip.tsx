import type { ReactNode } from 'react';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarToolbarTooltipProps {
  label: ReactNode;
  shortcut?: ReactNode;
  children: ReactNode;
}

export function SidebarToolbarTooltip({ label, shortcut, children }: SidebarToolbarTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="control-sidebar-tooltip-trigger" />}>
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom" sideOffset={8} className="whitespace-nowrap">
        <span className="control-sidebar-tooltip-content">
          <span>{label}</span>
          {shortcut ? <kbd className="control-sidebar-tooltip-shortcut">{shortcut}</kbd> : null}
        </span>
      </TooltipPopup>
    </Tooltip>
  );
}
