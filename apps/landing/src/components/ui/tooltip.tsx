"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function Tooltip({
  children,
  content,
}: {
  children: ReactNode
  content: ReactNode
}) {
  return (
    <div className="group/tooltip relative inline-block">
      {children}
      <div
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2",
          "whitespace-nowrap rounded-md border border-yellow/20 bg-black px-3 py-1.5",
          "text-xs text-yellow shadow-lg opacity-0 transition-opacity",
          "group-hover/tooltip:opacity-100"
        )}
      >
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
      </div>
    </div>
  )
}
