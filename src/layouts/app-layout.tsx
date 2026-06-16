import { useEffect } from "react"
import { useSetAtom } from "jotai"
import { Outlet } from "react-router-dom"

import { MapViewport } from "@/components/map-viewport"
import { TopNav } from "@/components/top-nav"
import { useLocale } from "@/lib/translations"
import { refreshEcotwinStateAtom } from "@/state/ecotwin-atoms"

export function AppLayout() {
  const refreshAppState = useSetAtom(refreshEcotwinStateAtom)
  const locale = useLocale()

  useEffect(() => {
    void refreshAppState()
  }, [refreshAppState])

  return (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <MapViewport key={`map-${locale}`} />
      <TopNav />
      <Outlet key={`page-${locale}`} />
    </div>
  )
}
