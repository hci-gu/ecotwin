import { useEffect } from "react"
import { useSetAtom } from "jotai"
import { Outlet } from "react-router-dom"

import { MapViewport } from "@/components/map-viewport"
import { TopNav } from "@/components/top-nav"
import { refreshEcotwinStateAtom } from "@/state/ecotwin-atoms"

export function AppLayout() {
  const refreshAppState = useSetAtom(refreshEcotwinStateAtom)

  useEffect(() => {
    void refreshAppState()
  }, [refreshAppState])

  return (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <MapViewport />
      <TopNav />
      <Outlet />
    </div>
  )
}
