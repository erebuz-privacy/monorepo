"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@erebuz/ui/lib/utils";

const Popover = PopoverPrimitive.Root;

function PopoverTrigger({ className, ...props }: PopoverPrimitive.Trigger.Props) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={cn(className)}
      {...props}
    />
  );
}

function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "center",
  alignOffset = 0,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "side" | "sideOffset" | "align" | "alignOffset"
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "origin-(--transform-origin) rounded-2xl bg-popover p-4 text-popover-foreground shadow-lg shadow-black/[0.06] ring-1 ring-foreground/10 outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 dark:shadow-2xl dark:shadow-black/40",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
