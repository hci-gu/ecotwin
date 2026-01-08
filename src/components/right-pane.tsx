import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type RightPaneProps = {
  children?: ReactNode
  className?: string
}

export function RightPane({ children, className }: RightPaneProps) {
  return (
    <aside className={cn(
      "absolute z-30 w-80 overflow-hidden border border-white/40 bg-white/80 shadow-2xl backdrop-blur-md bottom-pane right-pane top-[calc(var(--spacing-pane)*2+3.5rem)] rounded-pane",
      className
    )}>
      <div className="h-full overflow-auto p-4 [scrollbar-gutter:stable]">{children}</div>
    </aside>
  )
}

