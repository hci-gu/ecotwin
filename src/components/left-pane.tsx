import type { ReactNode } from "react"

type LeftPaneProps = {
  children?: ReactNode
}

export function LeftPane({ children }: LeftPaneProps) {
  return (
    <aside className="absolute z-30 w-80 flex flex-col gap-pane bottom-pane left-pane top-[calc(var(--spacing-pane)*2+3.5rem)]">
      {children}
    </aside>
  )
}
