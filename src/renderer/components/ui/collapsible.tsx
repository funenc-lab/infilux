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
          'motion-reduce:[&>div]:transition-none',
          '[&>div]:transition-[opacity,translate] [&>div]:duration-200 [&>div]:ease-out',
          '[&[data-ending-style]>div]:translate-y-1 [&[data-ending-style]>div]:opacity-0',
          '[&[data-starting-style]>div]:translate-y-1 [&[data-starting-style]>div]:opacity-0',
          typeof className === 'function' ? className(state) : className
        )
      }
      data-slot="collapsible-panel"
      {...props}
    >
      <div>{children}</div>
    </CollapsiblePrimitive.Panel>
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
  CollapsiblePanel as CollapsibleContent,
};
