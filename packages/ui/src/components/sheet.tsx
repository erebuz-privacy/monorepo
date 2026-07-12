"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "@erebuz/ui/lib/utils"
import { Button } from "@erebuz/ui/components/button"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

const SIDE = {
  right: "inset-y-0 right-0 h-dvh w-full max-w-md border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
  left: "inset-y-0 left-0 h-dvh w-full max-w-md border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
} as const

/**
 * Right- (or left-) anchored drawer. Slides in over a blurred backdrop using
 * base-ui's starting/ending-style transitions - smooth enter and exit, no layout
 * shift. Compose the header/body/footer inside as plain elements.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: keyof typeof SIDE
  showCloseButton?: boolean
}) {
  return (
    <SheetPrimitive.Portal data-slot="sheet-portal">
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ease-out supports-backdrop-filter:backdrop-blur-sm data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "bg-popover text-popover-foreground ring-foreground/10 fixed z-50 flex flex-col shadow-2xl ring-1 outline-none",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
          SIDE[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("border-border flex flex-col gap-1.5 border-b px-5 py-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("border-border mt-auto border-t p-4", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
