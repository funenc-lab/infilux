import type { CSSProperties, FocusEvent, PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PortalScopeProvider } from '@/components/ui/portal-scope';
import {
  isSidebarHoverRevealTextSelectionActive,
  resolveSidebarHoverRevealPointerActiveState,
  SIDEBAR_HOVER_REVEAL_FLOATING_GAP,
  shouldCloseSidebarHoverRevealAfterFocusChange,
  shouldOpenSidebarHoverReveal,
  shouldSyncSidebarHoverRevealAfterWindowFocus,
} from './sidebarHoverRevealPolicy';
import { SIDEBAR_MANAGED_PORTAL_SELECTOR, SIDEBAR_PORTAL_SCOPE } from './sidebarPortalScope';

interface SidebarHoverRevealGroupProps {
  children?: ReactNode;
  enabled: boolean;
}

function isSidebarManagedTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SIDEBAR_MANAGED_PORTAL_SELECTOR) !== null;
}

function isPointWithinRect(clientX: number, clientY: number, rect: DOMRect): boolean {
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  return (
    clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom
  );
}

export function SidebarHoverRevealGroup({ children, enabled }: SidebarHoverRevealGroupProps) {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);

  const isPointWithinInteractionSurface = useCallback((clientX: number, clientY: number) => {
    const groupElement = groupRef.current;
    if (!groupElement) {
      return false;
    }

    if (isPointWithinRect(clientX, clientY, groupElement.getBoundingClientRect())) {
      return true;
    }

    return Array.from(
      groupElement.querySelectorAll<HTMLElement>('[data-sidebar-hover-content="true"]')
    ).some((surface) => isPointWithinRect(clientX, clientY, surface.getBoundingClientRect()));
  }, []);

  const hasActiveTextSelection = useCallback(
    () => isSidebarHoverRevealTextSelectionActive(window.getSelection()),
    []
  );

  const handlePointerEvent = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      setActive((currentActive) =>
        resolveSidebarHoverRevealPointerActiveState({
          currentActive,
          documentFocused: document.hasFocus(),
          hasActiveTextSelection: hasActiveTextSelection(),
          pointerButtons: event.buttons,
        })
      );
    },
    [hasActiveTextSelection]
  );

  const handlePointerOut = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget;
      if (
        (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) ||
        isSidebarManagedTarget(nextTarget) ||
        isPointWithinInteractionSurface(event.clientX, event.clientY)
      ) {
        return;
      }

      setActive(false);
    },
    [isPointWithinInteractionSurface]
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const focusVisible =
        event.target instanceof Element && event.target.matches(':focus-visible');
      setActive((currentActive) =>
        shouldOpenSidebarHoverReveal({
          currentActive,
          documentFocused: document.hasFocus(),
          focusVisible,
          hasActiveTextSelection: hasActiveTextSelection(),
          pointerButtons: 0,
          trigger: 'keyboard',
        })
      );
    },
    [hasActiveTextSelection]
  );

  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    const nextFocusInside = nextTarget instanceof Node && event.currentTarget.contains(nextTarget);

    if (
      !shouldCloseSidebarHoverRevealAfterFocusChange({
        groupHovered: event.currentTarget.matches(':hover'),
        nextFocusInside,
        nextFocusManagedBySidebar: isSidebarManagedTarget(nextTarget),
        portalDismissedWithoutNextFocus:
          isSidebarManagedTarget(event.target) && nextTarget === null,
      })
    ) {
      return;
    }

    setActive(false);
  }, []);

  const syncAfterWindowFocus = useCallback(() => {
    if (!enabled) {
      return;
    }

    window.requestAnimationFrame(() => {
      const groupElement = groupRef.current;
      setActive(
        groupElement !== null &&
          shouldSyncSidebarHoverRevealAfterWindowFocus({
            documentFocused: document.hasFocus(),
            groupHovered: groupElement.matches(':hover'),
            hasActiveTextSelection: hasActiveTextSelection(),
          })
      );
    });
  }, [enabled, hasActiveTextSelection]);

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncAfterWindowFocus();
        return;
      }

      setActive(false);
    };
    const handleWindowBlur = () => setActive(false);

    window.addEventListener('focus', syncAfterWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', syncAfterWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, syncAfterWindowFocus]);

  useEffect(() => {
    if (!enabled || !active) {
      return;
    }

    const handleDocumentPointerOver = (event: globalThis.PointerEvent) => {
      const target = event.target;
      const groupElement = groupRef.current;
      if (
        (target instanceof Node && groupElement?.contains(target)) ||
        isSidebarManagedTarget(target) ||
        isPointWithinInteractionSurface(event.clientX, event.clientY)
      ) {
        return;
      }

      setActive(false);
    };

    document.addEventListener('pointerover', handleDocumentPointerOver);
    return () => document.removeEventListener('pointerover', handleDocumentPointerOver);
  }, [active, enabled, isPointWithinInteractionSurface]);

  const className = enabled
    ? 'control-sidebar-hover-reveal-group absolute left-0 top-0 z-30 flex h-full shrink-0 overflow-visible'
    : 'flex h-full shrink-0';
  const style = enabled
    ? ({
        '--control-sidebar-hover-edge-gap': `${SIDEBAR_HOVER_REVEAL_FLOATING_GAP}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      ref={groupRef}
      className={className}
      style={style}
      data-sidebar-hover-reveal-group={enabled ? 'active' : undefined}
      data-sidebar-hover-reveal-state={enabled ? (active ? 'open' : 'closed') : undefined}
      onPointerEnter={enabled ? handlePointerEvent : undefined}
      onPointerMove={enabled ? handlePointerEvent : undefined}
      onPointerOut={enabled ? handlePointerOut : undefined}
      onFocusCapture={enabled ? handleFocus : undefined}
      onBlurCapture={enabled ? handleBlur : undefined}
    >
      <PortalScopeProvider scope={SIDEBAR_PORTAL_SCOPE}>{children}</PortalScopeProvider>
    </div>
  );
}
