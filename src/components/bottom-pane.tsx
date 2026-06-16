import { cn } from "@/lib/utils"
import type { CSSProperties, ReactNode } from "react"

type BottomPaneProps = {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

export function BottomPane({ children, className, style }: BottomPaneProps) {
  return (
    <aside
      style={style}
      className={cn(
        "absolute z-30 overflow-hidden border border-white/40 bg-white/80 shadow-2xl backdrop-blur-md bottom-pane rounded-pane",
        className
      )}
    >
      <div className="p-4">{children}</div>
    </aside>
  )
}
