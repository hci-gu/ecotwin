import { LeftPane } from "@/components/left-pane"
import { GlassPane } from "@/components/glass-pane"
import { ActionsPane } from "@/components/actions-pane"
import { SimulationList } from "@/components/simulation-list"
import { TileDetails } from "@/components/tile-details"
import { RightPane } from "@/components/right-pane"
import { BiomassChart } from "@/components/biomass-chart"
import { BottomPane } from "@/components/bottom-pane"
import { SimulationTimeline } from "@/components/simulation-timeline"
import {
  fileUrl,
} from "@/state/ecotwin-api"
import {
  fetchLandcoverAtom,
  fetchOceanDataAtom,
  hoveredTileImageOverlayAtom,
  fetchTileByIdAtom,
  fetchSimulationByIdAtom,
  fetchSimulationResultByRecordIdAtom,
  fetchManagementPlanByIdAtom,
  landcoversByIdAtom,
  managementPlansAtom,
  managementPlanByIdCacheAtom,
  oceanDataByIdAtom,
  simulationByIdCacheAtom,
  simulationsAtom,
  tileByIdCacheAtom,
  managementPlanByIdLoadingAtom,
  simulationResultLoadingAtom,
  simulationResultByRecordIdAtom,
} from "@/state/ecotwin-atoms"
import { useEcotwinState } from "@/state/use-ecotwin-state"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo } from "react"
import {
  useNavigate,
  useParams,
} from "react-router-dom"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"

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
  const { tileId, simulationId, planId } = useParams<{ 
    tileId: string; 
    simulationId?: string; 
    planId?: string 
  }>()
  const navigate = useNavigate()

  const {
    tiles: tilesList,
    setHoveredTileId,
    setSelectedTileId,
  } = useEcotwinState()

  const tileByIdCache = useAtomValue(tileByIdCacheAtom)
  const managementPlans = useAtomValue(managementPlansAtom)
  const managementPlanByIdCache = useAtomValue(managementPlanByIdCacheAtom)
  const managementPlanByIdLoading = useAtomValue(managementPlanByIdLoadingAtom)
  const simulations = useAtomValue(simulationsAtom)
  const simulationByIdCache = useAtomValue(simulationByIdCacheAtom)
  const simulationResultByRecordId = useAtomValue(simulationResultByRecordIdAtom)
  const simulationResultLoading = useAtomValue(simulationResultLoadingAtom)
  
  const landcoversById = useAtomValue(landcoversByIdAtom)
  const oceanDataById = useAtomValue(oceanDataByIdAtom)
  
  const fetchTileById = useSetAtom(fetchTileByIdAtom)
  const fetchSimulationById = useSetAtom(fetchSimulationByIdAtom)
  const fetchManagementPlanById = useSetAtom(fetchManagementPlanByIdAtom)
  const fetchLandcover = useSetAtom(fetchLandcoverAtom)
  const fetchOceanData = useSetAtom(fetchOceanDataAtom)
  const setHoveredTileImageOverlay = useSetAtom(hoveredTileImageOverlayAtom)
  const fetchSimulationResultByRecordId = useSetAtom(
    fetchSimulationResultByRecordIdAtom
  )

  const activeSimulationId = simulationId
  const activePlanId = planId

  const activeSimulation = useMemo(() => {
    if (!activeSimulationId) return null
    return (
      simulations?.find((s) => s.id === activeSimulationId) ??
      simulationByIdCache[activeSimulationId] ??
      null
    )
  }, [activeSimulationId, simulationByIdCache, simulations])

  const activeSimulationResult = useMemo(() => {
    if (!activeSimulationId) return null
    return simulationResultByRecordId[activeSimulationId] ?? null
  }, [activeSimulationId, simulationResultByRecordId])

  useEffect(() => {
    if (!activeSimulationId) return
    if (activeSimulationResult) return
    if (!activeSimulation?.resultJson) return
    if (simulationResultLoading) return
    void fetchSimulationResultByRecordId({
      simulationRecordId: activeSimulationId,
      cachedOnly: true,
    })
  }, [
    activeSimulation?.resultJson,
    activeSimulationId,
    activeSimulationResult,
    fetchSimulationResultByRecordId,
    simulationResultLoading,
  ])

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
    return () => setSelectedTileId(null)
  }, [setHoveredTileId, setSelectedTileId, tileId])

  const tile = useMemo(() => {
    if (!tileId) return null
    const fromList = tilesList?.items.find((t: any) => t.id === tileId)
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
    if (!activeSimulationId) return
    if (activeSimulation) return
    void fetchSimulationById({ id: activeSimulationId })
  }, [activeSimulation, activeSimulationId, fetchSimulationById])

  useEffect(() => {
    if (!activePlanId) return
    if (activePlan) return
    void fetchManagementPlanById({ id: activePlanId })
  }, [activePlan, activePlanId, fetchManagementPlanById])

  return (
    <>
      <LeftPane>
        <GlassPane className="flex flex-col overflow-hidden">
          <SimulationList />
        </GlassPane>
        <ActionsPane className="animate-in slide-in-from-left-4 fade-in duration-300 shrink-0" />
      </LeftPane>

      <RightPane className="animate-in slide-in-from-right-4 fade-in duration-300">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between pb-2">
            <button
              onClick={() => navigate("/")}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
            >
              <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="rotate-90" />
              Back to map
            </button>
            {activeSimulationId || activePlanId ? (
              <button
                onClick={() => navigate(`/tile/${tileId}`)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer"
              >
                Clear selection
              </button>
            ) : null}
          </div>

          <TileDetails 
            name={tile?.name || "Untitled tile"} 
            status={simulationResultLoading ? "Running..." : "Ready to run"}
            createdDate={tile?.created?.substring(0, 10) || "2025-12-12"}
            landcoverContent={
              <div>
                {!tile?.landcover ? (
                  <div className="text-xs text-zinc-500 italic">No landcover linked</div>
                ) : selectedLandcover ? (
                  <div className="space-y-4">
                    <div className="aspect-square overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5">
                      {(selectedLandcover as any).color_100 ||
                      (selectedLandcover as any).color ||
                      (selectedLandcover as any).texture_100 ||
                      (selectedLandcover as any).texture ? (
                        <img
                          src={fileUrl(selectedLandcover as any, (selectedLandcover as any).color_100 || (selectedLandcover as any).color || (selectedLandcover as any).texture_100 || (selectedLandcover as any).texture) ?? ""}
                          alt="Landcover"
                          className="h-full w-full object-cover"
                          style={{ imageRendering: "pixelated" }}
                          onMouseEnter={() => {
                            const filename = (selectedLandcover as any).color_100 || (selectedLandcover as any).color || (selectedLandcover as any).texture_100 || (selectedLandcover as any).texture
                            const url = fileUrl(selectedLandcover as any, filename)
                            if (!url) return
                            setHoveredTileImageOverlay({ tileId: tile?.id ?? tileId ?? "", url, resampling: "nearest", opacity: 0.85 })
                          }}
                          onMouseLeave={clearOverlay}
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-xs text-zinc-400">No image</div>
                      )}
                    </div>
                    {coverageEntries && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Coverage</div>
                        <div className="space-y-1.5">
                          {coverageEntries.map((entry) => (
                            <div key={entry.key} className="flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] text-zinc-600">{entry.key}</span>
                              <span className="shrink-0 text-[11px] font-semibold text-zinc-900">
                                {entry.num !== null ? `${entry.num.toFixed(1)}%` : String(entry.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 animate-pulse">Loading landcover…</div>
                )}
              </div>
            }
            oceanDataContent={
              <div>
                {!tile?.oceanData ? (
                  <div className="text-xs text-zinc-500 italic">No ocean data linked</div>
                ) : selectedOceanData ? (
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["depth", (selectedOceanData as any).depth] as const,
                        ["elevation", (selectedOceanData as any).surface_elevation] as const,
                        ["temp", (selectedOceanData as any).water_temperature] as const,
                        ["velocity", (selectedOceanData as any).water_velocity] as const,
                      ] as const
                    ).map(([label, filename]) => {
                      if (!filename) return null
                      const url = fileUrl(selectedOceanData as any, filename)
                      const canPreview = isPreviewableImage(filename)
                      return (
                        <div key={label} className="rounded-md bg-white/50 p-2 ring-1 ring-black/5 hover:bg-white/80 transition-colors">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</div>
                          <div className="mt-2 aspect-square rounded overflow-hidden bg-zinc-100">
                            {url && canPreview ? (
                              <img
                                src={url}
                                alt={label}
                                className="h-full w-full object-cover"
                                onMouseEnter={() => setHoveredTileImageOverlay({ tileId: tile?.id ?? tileId ?? "", url, resampling: "nearest", opacity: 0.85 })}
                                onMouseLeave={clearOverlay}
                              />
                            ) : (
                              <div className="grid h-full place-items-center text-[9px] text-zinc-400">FILE</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 animate-pulse">Loading ocean data…</div>
                )}
              </div>
            }
          />

          {(activeSimulationId || activePlanId) && (
            <div className="mt-2 space-y-4 pt-6 border-t border-black/5">
              {activePlanId && (
                <div className="rounded-md border border-zinc-200 bg-white/50 p-4 shadow-sm">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Active Plan</div>
                  <div className="text-sm font-semibold text-zinc-900">{activePlan?.name || "Management plan"}</div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-1">{activePlanId}</div>
                  {managementPlanByIdLoading && <div className="mt-2 text-[11px] text-zinc-400 italic">Loading details...</div>}
                </div>
              )}

              {activeSimulationId && activeSimulation && (
                <div className="space-y-6">
                  <div className="rounded-md border border-zinc-200 bg-white/50 p-4 shadow-sm">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Active Simulation</div>
                    <div className="text-sm font-semibold text-zinc-900">Result visualization</div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1">{activeSimulationId}</div>
                    
                    {simulationResultByRecordId[activeSimulation.id] ? (
                      <div className="mt-4 pt-4 border-t border-black/5">
                        <BiomassChart result={simulationResultByRecordId[activeSimulation.id]} />
                      </div>
                    ) : (
                      <div className="mt-4 text-xs text-zinc-500 italic">Run simulation to see results</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </RightPane>

      {activeSimulationId && activeSimulationResult ? (
        <BottomPane>
          <div className="text-xs font-semibold text-zinc-900">Timeline</div>
          <div className="mt-2">
            <SimulationTimeline episodeLength={activeSimulationResult.episode_length} />
          </div>
        </BottomPane>
      ) : null}
    </>
  )
}
