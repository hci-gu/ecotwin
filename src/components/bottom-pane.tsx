import type { ReactNode } from "react"

type BottomPaneProps = {
  children?: ReactNode
}

export function BottomPane({ children }: BottomPaneProps) {
  return (
    <aside className="absolute left-1/2 z-30 w-[720px] -translate-x-1/2 overflow-hidden border border-white/40 bg-white/80 shadow-2xl backdrop-blur-md bottom-pane max-w-[calc(100%-var(--spacing-pane)*2)] rounded-pane">
      <div className="p-4">{children}</div>
    </aside>
  )
}

