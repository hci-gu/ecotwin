import { LeftPane } from "@/components/left-pane"
import { RightPane } from "@/components/right-pane"
import { cn } from "@/lib/utils"
import {
  createManagementPlan,
  createSimulation,
  fileUrl,
  getTile,
  updateTile,
} from "@/state/ecotwin-api"
import {
  fetchLandcoverAtom,
  fetchOceanDataAtom,
  hoveredTileImageOverlayAtom,
  fetchTileByIdAtom,
  fetchSimulationByIdAtom,
  fetchSimulationResultByRecordIdAtom,
  fetchManagementPlanByIdAtom,
  hoveredTileIdAtom,
  landcoversByIdAtom,
  managementPlansAtom,
  managementPlanByIdCacheAtom,
  managementPlanByIdErrorAtom,
  managementPlanByIdLoadingAtom,
  oceanDataByIdAtom,
  selectedTileIdAtom,
  simulationByIdCacheAtom,
  simulationByIdErrorAtom,
  simulationByIdLoadingAtom,
  simulationResultByRecordIdAtom,
  simulationResultErrorAtom,
  simulationResultLoadingAtom,
  simulationsAtom,
  tileByIdCacheAtom,
  tileByIdErrorAtom,
  tileByIdLoadingAtom,
  tilesListAtom,
} from "@/state/ecotwin-atoms"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Link,
  useMatch,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import type { ManagementPlan, Simulation } from "@/state/ecotwin-types"

type TileSimulationRef = Pick<Simulation, "id" | "plan" | "expand">

function isPreviewableImage(filename: string) {
  const lower = filename.toLowerCase()
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".avif") ||
    lower.endsWith(".bmp") ||
    lower.endsWith(".svg")
  )
}

export function TilePage() {
  const { tileId } = useParams<{ tileId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const create = searchParams.get("create")

  const tilesList = useAtomValue(tilesListAtom)
  const tileByIdCache = useAtomValue(tileByIdCacheAtom)
  const managementPlans = useAtomValue(managementPlansAtom)
  const managementPlanByIdCache = useAtomValue(managementPlanByIdCacheAtom)
  const managementPlanByIdLoading = useAtomValue(managementPlanByIdLoadingAtom)
  const managementPlanByIdError = useAtomValue(managementPlanByIdErrorAtom)
  const simulations = useAtomValue(simulationsAtom)
  const simulationByIdCache = useAtomValue(simulationByIdCacheAtom)
  const simulationByIdLoading = useAtomValue(simulationByIdLoadingAtom)
  const simulationByIdError = useAtomValue(simulationByIdErrorAtom)
  const simulationResultByRecordId = useAtomValue(simulationResultByRecordIdAtom)
  const simulationResultLoading = useAtomValue(simulationResultLoadingAtom)
  const simulationResultError = useAtomValue(simulationResultErrorAtom)
  const landcoversById = useAtomValue(landcoversByIdAtom)
  const oceanDataById = useAtomValue(oceanDataByIdAtom)
  const tileByIdLoading = useAtomValue(tileByIdLoadingAtom)
  const tileByIdError = useAtomValue(tileByIdErrorAtom)
  const fetchTileById = useSetAtom(fetchTileByIdAtom)
  const fetchSimulationById = useSetAtom(fetchSimulationByIdAtom)
  const fetchManagementPlanById = useSetAtom(fetchManagementPlanByIdAtom)
  const fetchLandcover = useSetAtom(fetchLandcoverAtom)
  const fetchOceanData = useSetAtom(fetchOceanDataAtom)
  const setHoveredTileImageOverlay = useSetAtom(hoveredTileImageOverlayAtom)
  const fetchSimulationResultByRecordId = useSetAtom(
    fetchSimulationResultByRecordIdAtom
  )
  const setTileByIdCache = useSetAtom(tileByIdCacheAtom)
  const setTilesList = useSetAtom(tilesListAtom)
  const setSimulations = useSetAtom(simulationsAtom)
  const setManagementPlans = useSetAtom(managementPlansAtom)
  const setSelectedTileId = useSetAtom(selectedTileIdAtom)
  const setHoveredTileId = useSetAtom(hoveredTileIdAtom)

  const [managementPlanName, setManagementPlanName] = useState("")
  const managementPlanNameDirtyRef = useRef(false)
  const [simulationPlanId, setSimulationPlanId] = useState("")
  const [simulationIdText, setSimulationIdText] = useState("")
  const [simulationOptionsText, setSimulationOptionsText] = useState("{}")
  const simulationOptionsDirtyRef = useRef(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const simulationRouteMatch = useMatch("/tile/:tileId/simulation/:simulationId")
  const planRouteMatch = useMatch("/tile/:tileId/management-plan/:planId")
  const activeSimulationId = simulationRouteMatch?.params?.simulationId
  const activePlanId = planRouteMatch?.params?.planId

  const activeSimulation = useMemo(() => {
    if (!activeSimulationId) return null
    return (
      simulations?.find((s) => s.id === activeSimulationId) ??
      simulationByIdCache[activeSimulationId] ??
      null
    )
  }, [activeSimulationId, simulationByIdCache, simulations])

  const activePlan = useMemo(() => {
    if (!activePlanId) return null
    return (
      managementPlans?.find((p) => p.id === activePlanId) ??
      managementPlanByIdCache[activePlanId] ??
      null
    )
  }, [activePlanId, managementPlanByIdCache, managementPlans])

  useEffect(() => {
    if (!tileId) return
    setSelectedTileId(tileId)
    setHoveredTileId(null)
  }, [setHoveredTileId, setSelectedTileId, tileId])

  const tile = useMemo(() => {
    if (!tileId) return null
    const fromList = tilesList?.items.find((t) => t.id === tileId)
    return fromList ?? tileByIdCache[tileId] ?? null
  }, [tileByIdCache, tileId, tilesList?.items])

  const selectedLandcover = useMemo(() => {
    if (!tile?.landcover) return null
    return (tile.expand?.landcover as any) ?? landcoversById[tile.landcover]
  }, [landcoversById, tile])

  useEffect(() => {
    if (!tile?.landcover) return
    if (selectedLandcover) return
    void fetchLandcover(tile.landcover).catch(() => {})
  }, [fetchLandcover, selectedLandcover, tile?.landcover])

  const coverageEntries = useMemo(() => {
    const coverage = (selectedLandcover as any)?.coverage
    if (!coverage || typeof coverage !== "object") return null
    const entries = Object.entries(coverage as Record<string, unknown>)
      .map(([key, value]) => ({
        key,
        value,
        num: typeof value === "number" ? value : null,
      }))
      .sort((a, b) => (b.num ?? -Infinity) - (a.num ?? -Infinity))
    return entries
  }, [selectedLandcover])

  const selectedOceanData = useMemo(() => {
    if (!tile?.oceanData) return null
    return (tile.expand?.oceanData as any) ?? oceanDataById[tile.oceanData]
  }, [oceanDataById, tile])

  useEffect(() => {
    if (!tile?.oceanData) return
    if (selectedOceanData) return
    void fetchOceanData(tile.oceanData).catch(() => {})
  }, [fetchOceanData, selectedOceanData, tile?.oceanData])

  const clearOverlay = () => setHoveredTileImageOverlay(null)

  useEffect(() => {
    if (!tileId) return
    if (tile) return
    void fetchTileById({ id: tileId })
  }, [fetchTileById, tile, tileId])

  useEffect(() => {
    setCreateError(null)
    setCreating(false)
  }, [create])

  useEffect(() => {
    if (create !== "management-plan") return
    if (managementPlanNameDirtyRef.current) return
    const suggested = tile?.name ? `${tile.name} plan` : "New management plan"
    setManagementPlanName(suggested)
  }, [create, tile?.name])

  useEffect(() => {
    if (create !== "simulation") return
    if (simulationOptionsDirtyRef.current) return
    setSimulationOptionsText("{}")
  }, [create])

  useEffect(() => {
    if (!activeSimulationId) return
    if (activeSimulation) return
    void fetchSimulationById({ id: activeSimulationId })
  }, [activeSimulation, activeSimulationId, fetchSimulationById])

  useEffect(() => {
    if (!activePlanId) return
    if (activePlan) return
    void fetchManagementPlanById({ id: activePlanId })
  }, [activePlan, activePlanId, fetchManagementPlanById])

  const tileSimulations = useMemo<TileSimulationRef[]>(() => {
    const expanded = tile?.expand?.simulations
    if (Array.isArray(expanded) && expanded.length > 0) return expanded

    const ids = tile?.simulations
    if (!ids?.length) return []
    if (!simulations?.length) return ids.map((id) => ({ id }))

    const byId = new Map(simulations.map((s) => [s.id, s]))
    return ids.map((id) => byId.get(id) ?? { id })
  }, [simulations, tile?.expand?.simulations, tile?.simulations])

  const tileManagementPlans = useMemo(() => {
    const planIds = new Set<string>()
    const plans: Pick<ManagementPlan, "id" | "name">[] = []

    for (const sim of tileSimulations as TileSimulationRef[]) {
      const expandedPlan = sim.expand?.plan
      const planId = sim.plan
      if (expandedPlan?.id && !planIds.has(expandedPlan.id)) {
        planIds.add(expandedPlan.id)
        plans.push({ id: expandedPlan.id, name: expandedPlan.name })
        continue
      }
      if (planId && !planIds.has(planId)) {
        planIds.add(planId)
      }
    }

    if (!managementPlans?.length) return plans

    const byId = new Map(managementPlans.map((p) => [p.id, p]))
    for (const id of planIds) {
      if (plans.some((p) => p.id === id)) continue
      const found = byId.get(id)
      if (found) plans.push(found)
    }

    return plans
  }, [managementPlans, tileSimulations])

  const clearCreateMode = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("create")
      return next
    })
  }

  const openCreateMode = (mode: "management-plan" | "simulation") => {
    setCreateError(null)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("create", mode)
      return next
    })
  }

  const refreshTileInCaches = async () => {
    if (!tileId) return
    const refreshed = await getTile(tileId, {
      expand:
        "heightmap,landcover,oceanData,simulations,simulations.plan,simulations.plan.tasks",
    })

    setTileByIdCache((prev) => ({ ...prev, [tileId]: refreshed }))
    setTilesList((prev) => {
      if (!prev?.items?.length) return prev
      const items = prev.items.map((t) => (t.id === tileId ? refreshed : t))
      return { ...prev, items }
    })
  }

  const onCreateManagementPlan = async () => {
    if (!tileId || !tile) return
    const name = managementPlanName.trim()
    if (!name) {
      setCreateError("Please enter a name.")
      return
    }

    setCreating(true)
    setCreateError(null)
    try {
      const plan = await createManagementPlan({ name })
      const sim = await createSimulation({ plan: plan.id })
      const nextSimulations = Array.from(
        new Set([...(tile.simulations ?? []), sim.id])
      )
      await updateTile(tileId, { simulations: nextSimulations })

      setSimulations((prev) => (prev ? [sim, ...prev] : prev))
      setManagementPlans((prev) => (prev ? [plan, ...prev] : prev))
      await refreshTileInCaches()
      clearCreateMode()
      navigate(`/tile/${tileId}/management-plan/${plan.id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const onCreateSimulation = async () => {
    if (!tileId || !tile) return

    let options: unknown | undefined = undefined
    const raw = simulationOptionsText.trim()
    if (raw) {
      try {
        options = JSON.parse(raw) as unknown
      } catch {
        setCreateError("Simulation options must be valid JSON.")
        return
      }
    }

    setCreating(true)
    setCreateError(null)
    try {
      const data: Parameters<typeof createSimulation>[0] = {}
      if (simulationPlanId) data.plan = simulationPlanId
      if (simulationIdText.trim()) data.simulationId = simulationIdText.trim()
      if (options !== undefined) data.options = options

      const sim = await createSimulation(data)
      const nextSimulations = Array.from(
        new Set([...(tile.simulations ?? []), sim.id])
      )
      await updateTile(tileId, { simulations: nextSimulations })

      setSimulations((prev) => (prev ? [sim, ...prev] : prev))
      await refreshTileInCaches()
      clearCreateMode()
      navigate(`/tile/${tileId}/simulation/${sim.id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <LeftPane>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">
            Management plans
          </div>
          {create !== "management-plan" ? (
            <button
              type="button"
              onClick={() => openCreateMode("management-plan")}
              className="inline-flex cursor-pointer items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50"
            >
              Create
            </button>
          ) : null}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
          </div>

          {create === "management-plan" ? (
            <div className="mt-3 rounded-md bg-white/70 p-3 ring-1 ring-black/5">
              <label className="block text-[11px] font-medium text-zinc-800">
                Plan name
                <input
                  value={managementPlanName}
                  onChange={(e) => {
                    managementPlanNameDirtyRef.current = true
                    setManagementPlanName(e.target.value)
                  }}
                  className="mt-1 w-full rounded-md bg-white px-2 py-1 text-xs text-zinc-900 shadow-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                  placeholder="My management plan"
                />
              </label>

              <div className="mt-2 text-[11px] text-zinc-600">
                Creates a management plan and a simulation on this tile using
                the plan.
              </div>

              {createError ? (
                <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
                  {createError}
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={creating || !tile}
                  onClick={() => void onCreateManagementPlan()}
                  className="inline-flex cursor-pointer items-center rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={clearCreateMode}
                  className="inline-flex cursor-pointer items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {tileManagementPlans.length ? (
              tileManagementPlans.map((plan) => (
                <Link
                  key={plan.id}
                  to={`/tile/${tileId}/management-plan/${plan.id}`}
                  className={cn(
                    "block rounded-md bg-white/70 px-3 py-2 ring-1 ring-black/5 hover:bg-white",
                    activePlanId === plan.id && "ring-2 ring-zinc-900/20"
                  )}
                >
                  <div className="truncate text-xs font-medium text-zinc-900">
                    {plan.name || "Untitled plan"}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-zinc-700">
                    {plan.id}
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-xs text-zinc-700">
                No management plans for this tile.
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-200 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900">Simulations</div>
            {create !== "simulation" ? (
              <button
                type="button"
                onClick={() => openCreateMode("simulation")}
                className="inline-flex cursor-pointer items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50"
              >
                Create
              </button>
            ) : null}
          </div>

          {create === "simulation" ? (
            <div className="mt-3 rounded-md bg-white/70 p-3 ring-1 ring-black/5">
              <label className="block text-[11px] font-medium text-zinc-800">
                Management plan (optional)
                <select
                  value={simulationPlanId}
                  onChange={(e) => setSimulationPlanId(e.target.value)}
                  className="mt-1 w-full rounded-md bg-white px-2 py-1 text-xs text-zinc-900 shadow-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                >
                  <option value="">No plan</option>
                  {(managementPlans ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-3 block text-[11px] font-medium text-zinc-800">
                Simulation ID (optional)
                <input
                  value={simulationIdText}
                  onChange={(e) => setSimulationIdText(e.target.value)}
                  className="mt-1 w-full rounded-md bg-white px-2 py-1 text-xs text-zinc-900 shadow-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                  placeholder="UUID from /simulate/upload"
                />
              </label>

              <label className="mt-3 block text-[11px] font-medium text-zinc-800">
                Options (JSON)
                <textarea
                  value={simulationOptionsText}
                  onChange={(e) => {
                    simulationOptionsDirtyRef.current = true
                    setSimulationOptionsText(e.target.value)
                  }}
                  rows={6}
                  className="mt-1 w-full resize-y rounded-md bg-white px-2 py-1 font-mono text-[11px] text-zinc-900 shadow-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                />
              </label>

              {createError ? (
                <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
                  {createError}
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={creating || !tile}
                  onClick={() => void onCreateSimulation()}
                  className="inline-flex cursor-pointer items-center rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={clearCreateMode}
                  className="inline-flex cursor-pointer items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {tileSimulations.length ? (
              tileSimulations.map((sim) => (
                <Link
                  key={sim.id}
                  to={`/tile/${tileId}/simulation/${sim.id}`}
                  className={cn(
                    "block rounded-md bg-white/70 px-3 py-2 ring-1 ring-black/5 hover:bg-white",
                    activeSimulationId === sim.id && "ring-2 ring-zinc-900/20"
                  )}
                >
                  <div className="truncate text-xs font-medium text-zinc-900">
                    {sim.id}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-zinc-700">
                    Plan: {sim.expand?.plan?.name ?? (sim.plan ? sim.plan : "—")}
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-xs text-zinc-700">
                No simulations for this tile.
              </div>
            )}
          </div>
        </div>
      </LeftPane>

      <RightPane>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">
              {tile?.name || "Tile"}
            </div>
            <div className="mt-1 text-xs text-zinc-700">
              {activeSimulationId || activePlanId
                ? activeSimulationId
                  ? `Simulation ${activeSimulationId}`
                  : `Management plan ${activePlanId}`
                : tile
                  ? `${tile.zoom}/${tile.x}/${tile.y}`
                  : tileId}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            {activeSimulationId || activePlanId ? (
              <Link
                to={`/tile/${tileId}`}
                className="cursor-pointer rounded-md bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-50"
              >
                Clear
              </Link>
            ) : null}
            <Link
              to="/"
              className="cursor-pointer rounded-md bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-50"
            >
              Back
            </Link>
          </div>
        </div>

        {!activeSimulationId && !activePlanId ? (
          <>
            <div className="mt-4 space-y-2 text-xs text-zinc-800">
              <div>
                <span className="text-zinc-600">id:</span> {tileId}
              </div>
              {!tile && tileByIdLoading ? (
                <div className="text-zinc-700">Loading tile…</div>
              ) : null}
              {!tile && tileByIdError ? (
                <div className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
                  Failed to load tile: {tileByIdError.message}
                </div>
              ) : null}
              {tile?.landcover ? (
                <div>
                  <span className="text-zinc-600">landcover:</span>{" "}
                  {tile.landcover}
                </div>
              ) : null}
              {tile?.oceanData ? (
                <div>
                  <span className="text-zinc-600">oceanData:</span>{" "}
                  {tile.oceanData}
                </div>
              ) : null}
            </div>

            <div className="mt-6 text-sm text-zinc-700">
              Select a simulation or management plan on the left.
            </div>

            <div className="mt-6 border-t border-zinc-200 pt-4">
              <div className="text-xs font-semibold text-zinc-900">
                Landcover
              </div>
              {!tile?.landcover ? (
                <div className="mt-2 text-sm text-zinc-700">
                  No landcover linked to this tile.
                </div>
              ) : selectedLandcover ? (
                <>
                  <div className="mt-2 aspect-square overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10">
                    {(selectedLandcover as any).color_100 ||
                    (selectedLandcover as any).color ||
                    (selectedLandcover as any).texture_100 ||
                    (selectedLandcover as any).texture ? (
                      <img
                        src={
                          fileUrl(
                            selectedLandcover as any,
                            (selectedLandcover as any).color_100 ||
                              (selectedLandcover as any).color ||
                              (selectedLandcover as any).texture_100 ||
                              (selectedLandcover as any).texture
                          ) ?? ""
                        }
                        alt="Landcover"
                        className="h-full w-full object-cover"
                        style={{ imageRendering: "pixelated" }}
                        loading="lazy"
                        onMouseEnter={() => {
                          const filename =
                            (selectedLandcover as any).color_100 ||
                            (selectedLandcover as any).color ||
                            (selectedLandcover as any).texture_100 ||
                            (selectedLandcover as any).texture
                          const url = fileUrl(selectedLandcover as any, filename)
                          if (!url) return
                          setHoveredTileImageOverlay({
                            tileId: tile?.id ?? tileId ?? "",
                            url,
                            resampling: "nearest",
                            opacity: 0.85,
                          })
                        }}
                        onMouseLeave={clearOverlay}
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-zinc-600">
                        No landcover image
                      </div>
                    )}
                  </div>

                  {coverageEntries ? (
                    <div className="mt-4">
                      <div className="text-xs text-zinc-600">Coverage</div>
                      <div className="mt-2 space-y-1 text-xs text-zinc-800">
                        {coverageEntries.map((entry) => (
                          <div
                            key={entry.key}
                            className="flex items-baseline justify-between gap-3"
                          >
                            <div className="min-w-0 truncate text-zinc-700">
                              {entry.key}
                            </div>
                            <div className="flex-none font-medium text-zinc-900">
                              {entry.num !== null
                                ? `${new Intl.NumberFormat(undefined, {
                                    maximumFractionDigits: 1,
                                  }).format(entry.num)}%`
                                : String(entry.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (selectedLandcover as any).coverage ? (
                    <div className="mt-4 text-xs text-zinc-700">
                      Coverage: {JSON.stringify((selectedLandcover as any).coverage)}
                    </div>
                  ) : (
                    <div className="mt-4 text-sm text-zinc-700">
                      No coverage data.
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-2 text-sm text-zinc-700">
                  Loading landcover…
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-zinc-200 pt-4">
              <div className="text-xs font-semibold text-zinc-900">
                Ocean data
              </div>
              {!tile?.oceanData ? (
                <div className="mt-2 text-sm text-zinc-700">
                  No ocean data linked to this tile.
                </div>
              ) : selectedOceanData ? (
                <div className="mt-3 space-y-3">
                  {(
                    [
                      ["depth", (selectedOceanData as any).depth] as const,
                      ["surface_elevation", (selectedOceanData as any).surface_elevation] as const,
                      ["water_temperature", (selectedOceanData as any).water_temperature] as const,
                      ["water_velocity", (selectedOceanData as any).water_velocity] as const,
                    ] as const
                  ).map(([label, filename]) => {
                    if (!filename) return null
                    const url = fileUrl(selectedOceanData as any, filename)
                    const canPreview = isPreviewableImage(filename)
                    return (
                      <div
                        key={label}
                        className="rounded-md bg-white/70 p-2 ring-1 ring-black/5"
                      >
                        <div className="text-[11px] font-medium text-zinc-800">
                          {label}
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="aspect-square w-16 overflow-hidden rounded bg-zinc-200">
                            {url && canPreview ? (
                              <img
                                src={url}
                                alt={label}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                onMouseEnter={() =>
                                  setHoveredTileImageOverlay({
                                    tileId: tile?.id ?? tileId ?? "",
                                    url,
                                    resampling: "nearest",
                                    opacity: 0.85,
                                  })
                                }
                                onMouseLeave={clearOverlay}
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-[10px] text-zinc-600">
                                File
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-xs text-zinc-700">
                              {filename}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-2 text-sm text-zinc-700">
                  Loading ocean data…
                </div>
              )}
            </div>
          </>
        ) : null}

        {activePlanId ? (
          <div className="mt-6 rounded-md bg-white/70 p-3 ring-1 ring-black/5">
            <div className="text-xs font-semibold text-zinc-900">
              Management plan
            </div>
            <div className="mt-1 text-sm text-zinc-900">
              {activePlan?.name ?? "Plan"}
            </div>
            <div className="mt-1 text-xs text-zinc-700">{activePlanId}</div>
            {managementPlanByIdError && !activePlan ? (
              <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
                Failed to load plan: {managementPlanByIdError.message}
              </div>
            ) : null}
            {!activePlan ? (
              <div className="mt-2 text-[11px] text-zinc-600">
                {managementPlanByIdLoading ? "Loading plan…" : "—"}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeSimulationId ? (
          <div className="mt-6 rounded-md bg-white/70 p-3 ring-1 ring-black/5">
            <div className="text-xs font-semibold text-zinc-900">Simulation</div>
            <div className="mt-1 text-xs text-zinc-700">
              {activeSimulation?.id ?? activeSimulationId}
            </div>
            <div className="mt-1 text-[11px] text-zinc-700">
              Plan:{" "}
              {activeSimulation?.expand?.plan?.name ??
                (activeSimulation?.plan ? activeSimulation.plan : "—")}
            </div>
            <div className="mt-1 text-[11px] text-zinc-700">
              simulationId:{" "}
              {activeSimulation?.simulationId ? (
                <span className="font-mono">{activeSimulation.simulationId}</span>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </div>

            {simulationByIdError && !activeSimulation ? (
              <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
                Failed to load simulation: {simulationByIdError.message}
              </div>
            ) : null}

            {!activeSimulation ? (
              <div className="mt-2 text-[11px] text-zinc-600">
                {simulationByIdLoading ? "Loading simulation…" : "—"}
              </div>
            ) : null}

            {activeSimulation ? (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      simulationResultLoading || !activeSimulation.simulationId
                    }
                    onClick={() =>
                      void fetchSimulationResultByRecordId({
                        simulationRecordId: activeSimulation.id,
                      })
                    }
                    className="inline-flex cursor-pointer items-center rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {simulationResultLoading ? "Fetching…" : "Fetch data"}
                  </button>
                  {!activeSimulation.simulationId ? (
                    <div className="text-[11px] text-zinc-600">
                      Set a <span className="font-mono">simulationId</span> to
                      fetch results.
                    </div>
                  ) : null}
                </div>

                {simulationResultError ? (
                  <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
                    {simulationResultError.message}
                  </div>
                ) : null}

                {simulationResultByRecordId[activeSimulation.id] ? (
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-700">
                    <div>
                      episode_length:{" "}
                      {
                        simulationResultByRecordId[activeSimulation.id]
                          .episode_length
                      }
                    </div>
                    <div>
                      fitness:{" "}
                      {simulationResultByRecordId[activeSimulation.id].fitness ??
                        "—"}
                    </div>
                    <div>
                      samples:{" "}
                      {
                        simulationResultByRecordId[activeSimulation.id].steps
                          ?.length
                      }
                    </div>
                    <div>
                      shape:{" "}
                      {simulationResultByRecordId[activeSimulation.id].shape?.join(
                        "×"
                      )}
                    </div>
                    <div>
                      species:{" "}
                      {simulationResultByRecordId[activeSimulation.id].species
                        ?.length ?? 0}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </RightPane>
    </>
  )
}
