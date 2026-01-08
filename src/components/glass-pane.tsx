import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type GlassPaneProps = {
  children: ReactNode
  className?: string
}

export function GlassPane({ children, className }: GlassPaneProps) {
  return (
    <div className={cn(
      "flex flex-col overflow-hidden border border-white/40 bg-white/80 shadow-2xl backdrop-blur-md rounded-pane",
      className
    )}>
      {children}
    </div>
  )
}
