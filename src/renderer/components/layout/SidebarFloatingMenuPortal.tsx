import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface SidebarFloatingMenuPortalProps {
  children: ReactNode;
}

export function SidebarFloatingMenuPortal({ children }: SidebarFloatingMenuPortalProps): ReactNode {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div data-sidebar-floating-menu-portal="true">{children}</div>,
    document.body
  );
}
