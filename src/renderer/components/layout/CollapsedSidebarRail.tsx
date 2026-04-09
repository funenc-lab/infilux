import { ChevronRight } from 'lucide-react';
import type { ElementType } from 'react';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { cn } from '@/lib/utils';

export interface CollapsedSidebarRailAction {
  id: string;
  label: string;
  icon: ElementType;
  onSelect: () => void;
  disabled?: boolean;
  separatorBefore?: boolean;
}

interface CollapsedSidebarRailProps {
  label: string;
  triggerTitle: string;
  icon: ElementType;
  actions: readonly CollapsedSidebarRailAction[];
  className?: string;
  popupClassName?: string;
}

export function CollapsedSidebarRail({
  label,
  triggerTitle,
  icon: Icon,
  actions,
  className,
  popupClassName,
}: CollapsedSidebarRailProps) {
  return (
    <div
      data-collapsed-sidebar={label}
      className={cn(
        'flex h-full w-full items-start justify-center border-r bg-background/96 px-1 py-2',
        className
      )}
    >
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              className="control-sidebar-toolbutton flex h-9 w-9 items-center justify-center"
              title={triggerTitle}
              aria-label={triggerTitle}
            >
              <span
                data-slot="collapsed-sidebar-trigger-icon"
                className="relative inline-flex h-4.5 w-4.5 items-center justify-center"
              >
                <Icon className="h-4 w-4" />
                <span
                  data-slot="collapsed-sidebar-expand-indicator"
                  aria-hidden="true"
                  className="absolute -right-1 -bottom-1 inline-flex h-3 w-3 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm"
                >
                  <ChevronRight className="h-2 w-2" />
                </span>
              </span>
            </button>
          }
        />
        <MenuPopup side="inline-end" align="start" sideOffset={8} className={popupClassName}>
          {actions.map((action, index) => {
            const ActionIcon = action.icon;

            return (
              <div key={action.id}>
                {action.separatorBefore && index > 0 ? <MenuSeparator /> : null}
                <MenuItem onClick={action.onSelect} disabled={action.disabled}>
                  <ActionIcon className="h-4 w-4" />
                  {action.label}
                </MenuItem>
              </div>
            );
          })}
        </MenuPopup>
      </Menu>
    </div>
  );
}
