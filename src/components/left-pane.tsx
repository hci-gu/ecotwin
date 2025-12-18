import type { ReactNode } from "react"

type LeftPaneProps = {
  children?: ReactNode
}

export function LeftPane({ children }: LeftPaneProps) {
  return (
    <aside className="absolute bottom-6 left-6 top-6 z-10 w-72 overflow-hidden bg-zinc-300 shadow-sm">
      <div className="h-full overflow-auto p-4">{children}</div>
    </aside>
  )
}
