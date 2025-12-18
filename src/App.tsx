import { AppLayout } from "@/layouts/app-layout"
import { ManagementPlansPage } from "@/pages/management-plans-page"
import { MapPage } from "@/pages/map-page"
import { SimulationsPage } from "@/pages/simulations-page"
import { TilePage } from "@/pages/tile-page"
import { Navigate, Route, Routes } from "react-router-dom"

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<MapPage />} />
        <Route path="tile/:tileId/*" element={<TilePage />} />
        <Route path="management-plans" element={<ManagementPlansPage />} />
        <Route path="simulations" element={<SimulationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
