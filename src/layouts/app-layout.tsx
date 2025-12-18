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
    <div className="flex h-screen flex-col">
      <TopNav />
      <main className="relative flex-1">
        <MapViewport />
        <Outlet />
      </main>
    </div>
  )
}
