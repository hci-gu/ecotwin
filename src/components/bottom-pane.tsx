import type { ReactNode } from "react"

type BottomPaneProps = {
  children?: ReactNode
}

export function BottomPane({ children }: BottomPaneProps) {
  return (
    <aside className="absolute bottom-6 left-1/2 z-10 w-[720px] max-w-[calc(100%-3rem)] -translate-x-1/2 overflow-hidden rounded-md bg-zinc-100 shadow-sm ring-1 ring-black/5">
      <div className="p-3">{children}</div>
    </aside>
  )
}

