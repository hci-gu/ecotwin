import type { ReactNode } from "react"

type RightPaneProps = {
  children?: ReactNode
}

export function RightPane({ children }: RightPaneProps) {
  return (
    <aside className="absolute bottom-6 right-6 top-6 z-10 w-80 overflow-hidden bg-zinc-100 shadow-sm">
      <div className="h-full overflow-auto p-4">{children}</div>
    </aside>
  )
}

