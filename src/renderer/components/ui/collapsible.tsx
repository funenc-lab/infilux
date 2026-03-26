'use client';

import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

import { cn } from '@/lib/utils';

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

function CollapsiblePanel({ className, children, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      className={(state) =>
        cn(
          'h-(--collapsible-panel-height) overflow-hidden data-ending-style:h-0 data-starting-style:h-0',
          typeof className === 'function' ? className(state) : className
        )
      }
      data-slot="collapsible-panel"
      {...props}
    >
      <div
        className={cn(
          'motion-reduce:transition-none',
          'transition-[opacity,translate] duration-200 ease-out',
          '[.data-ending-style_&]:translate-y-1 [.data-ending-style_&]:opacity-0',
          '[.data-starting-style_&]:translate-y-1 [.data-starting-style_&]:opacity-0'
        )}
      >
        {children}
      </div>
    </CollapsiblePrimitive.Panel>
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
  CollapsiblePanel as CollapsibleContent,
};
