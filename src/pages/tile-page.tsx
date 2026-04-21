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
  hasActiveTileGeneration,
  landcoverStatusMessage,
  oceanDataStatusMessage,
  tilePrimaryStatus,
} from "@/lib/tile-population"
import {
  fileUrl,
} from "@/state/ecotwin-api"
import {
  createSimulationAtom,
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
  simulationResultErrorAtom,
  simulationResultByRecordIdAtom,
} from "@/state/ecotwin-atoms"
import {
  biomassVisualizationAtom,
  selectedSimulationSpeciesAtom,
} from "@/state/simulation-ui-state"
import type { Landcover, OceanData } from "@/state/ecotwin-types"
import { useEcotwinState } from "@/state/use-ecotwin-state"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useState } from "react"
import {
  useNavigate,
  useParams,
} from "react-router-dom"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"

const speciesSwatchColors = [
  "#fbbf24",
  "#10b981",
  "#0ea5e9",
  "#f43f5e",
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#84cc16",
]

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
  const simulationResultError = useAtomValue(simulationResultErrorAtom)
  
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
  const createSimulation = useSetAtom(createSimulationAtom)
  const [biomassVisualization, setBiomassVisualization] = useAtom(biomassVisualizationAtom)
  const [selectedSimulationSpecies, setSelectedSimulationSpecies] = useAtom(
    selectedSimulationSpeciesAtom
  )

  const [runError, setRunError] = useState<string | null>(null)
  const [runPending, setRunPending] = useState(false)
  const [speciesSectionOpen, setSpeciesSectionOpen] = useState(true)

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

  const activeSimulationSummary = useMemo(() => {
    if (!activeSimulationResult) return null
    const [frameCount = 0, height = 0, width = 0, speciesCount = 0] =
      Array.isArray(activeSimulationResult.shape) ? activeSimulationResult.shape : []
    const firstStep = activeSimulationResult.steps[0] ?? 0
    const lastStep =
      activeSimulationResult.steps[activeSimulationResult.steps.length - 1] ??
      activeSimulationResult.episode_length

    return {
      frameCount,
      height,
      width,
      speciesCount,
      firstStep,
      lastStep,
      sampleEvery: activeSimulationResult.sample_every,
    }
  }, [activeSimulationResult])

  const activeSimulationSpecies = useMemo(() => {
    if (!activeSimulationResult) return []
    const shape = activeSimulationResult.shape
    const speciesCount =
      Array.isArray(shape) && shape.length === 4 ? Number(shape[3]) : 0
    if (
      Array.isArray(activeSimulationResult.species) &&
      activeSimulationResult.species.length === speciesCount
    ) {
      return activeSimulationResult.species
    }
    return Array.from({ length: speciesCount }, (_, i) => `Species ${i + 1}`)
  }, [activeSimulationResult])

  useEffect(() => {
    setSelectedSimulationSpecies(null)
  }, [activeSimulationId, setSelectedSimulationSpecies])

  useEffect(() => {
    if (!activeSimulationId || !activeSimulationSpecies.length) return

    setSelectedSimulationSpecies((current) => {
      if (current === null) return activeSimulationSpecies

      const next = current.filter((name) => activeSimulationSpecies.includes(name))
      if (
        next.length === current.length &&
        next.every((name, index) => name === current[index])
      ) {
        return current
      }
      return next
    })
  }, [activeSimulationId, activeSimulationSpecies, setSelectedSimulationSpecies])

  const selectedSpeciesList = selectedSimulationSpecies ?? activeSimulationSpecies
  const selectedSpeciesCount = selectedSpeciesList.length

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
    const resolvedPlanId = activePlanId ?? activeSimulation?.expand?.plan?.id ?? activeSimulation?.plan
    if (!resolvedPlanId) return null
    if (activeSimulation?.expand?.plan?.id === resolvedPlanId) {
      return activeSimulation.expand.plan
    }
    return (
      managementPlans?.find((p) => p.id === resolvedPlanId) ??
      managementPlanByIdCache[resolvedPlanId] ??
      null
    )
  }, [activePlanId, activeSimulation, managementPlanByIdCache, managementPlans])

  const tileManagementPlans = useMemo(() => {
    if (!tileId) return activePlan ? [activePlan] : []

    const plans = (managementPlans ?? []).filter(
      (plan) => plan.tile === tileId || plan.expand?.tile?.id === tileId
    )

    if (activePlan && !plans.some((plan) => plan.id === activePlan.id)) {
      return [activePlan, ...plans]
    }

    return plans
  }, [activePlan, managementPlans, tileId])

  useEffect(() => {
    if (!tileId) return
    setSelectedTileId(tileId)
    setHoveredTileId(null)
    return () => setSelectedTileId(null)
  }, [setHoveredTileId, setSelectedTileId, tileId])

  const tile = useMemo(() => {
    if (!tileId) return null
    const fromList = tilesList?.items.find((t) => t.id === tileId)
    return tileByIdCache[tileId] ?? fromList ?? null
  }, [tileByIdCache, tileId, tilesList?.items])
  const tilePollId = tile?.id ?? null
  const tileHasActiveGeneration = hasActiveTileGeneration(tile)

  const selectedLandcover = useMemo(() => {
    if (!tile?.landcover) return null
    return tile.expand?.landcover ?? (landcoversById[tile.landcover] as Landcover | undefined) ?? null
  }, [landcoversById, tile])

  useEffect(() => {
    if (!tile?.landcover) return
    if (selectedLandcover) return
    void fetchLandcover(tile.landcover).catch(() => {})
  }, [fetchLandcover, selectedLandcover, tile?.landcover])

  const coverageEntries = useMemo(() => {
    const coverage = selectedLandcover?.coverage
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
    return tile.expand?.oceanData ?? (oceanDataById[tile.oceanData] as OceanData | undefined) ?? null
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
    if (!tilePollId || !tileHasActiveGeneration) return

    void fetchTileById({ id: tilePollId }).catch(() => {})
    const interval = window.setInterval(() => {
      void fetchTileById({ id: tilePollId }).catch(() => {})
    }, 3000)

    return () => window.clearInterval(interval)
  }, [fetchTileById, tileHasActiveGeneration, tilePollId])

  useEffect(() => {
    if (!activeSimulationId) return
    if (activeSimulation) return
    void fetchSimulationById({ id: activeSimulationId })
  }, [activeSimulation, activeSimulationId, fetchSimulationById])

  useEffect(() => {
    const resolvedPlanId = activePlanId ?? activeSimulation?.plan
    if (!resolvedPlanId) return
    if (activePlan) return
    void fetchManagementPlanById({ id: resolvedPlanId })
  }, [activePlan, activePlanId, activeSimulation?.plan, fetchManagementPlanById])

  const canRunSimulation = Boolean(activePlan && tile?.landcover && tile?.oceanData)
  const simulationBackHref =
    tileId && activePlan?.id
      ? `/tile/${tileId}/management-plan/${activePlan.id}`
      : tileId
        ? `/tile/${tileId}`
        : "/"

  async function handleRunSimulation() {
    if (!tileId || !activePlan) return

    setRunPending(true)
    setRunError(null)

    try {
      const simulation = await createSimulation({ planId: activePlan.id })
      navigate(`/tile/${tileId}/simulation/${simulation.id}`)

      const result = await fetchSimulationResultByRecordId({
        simulationRecordId: simulation.id,
        forceRun: true,
      })

      if (!result) {
        throw new Error("Simulation run did not return a result.")
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunPending(false)
    }
  }
  const tileStatus = tilePrimaryStatus(tile, simulationResultLoading)

  return (
    <>
      <LeftPane>
        <GlassPane className="flex flex-col overflow-hidden">
          <SimulationList />
        </GlassPane>
        <ActionsPane
          className="animate-in slide-in-from-left-4 fade-in duration-300 shrink-0"
          activePlan={activePlan}
          canRunSimulation={canRunSimulation}
          isRunningSimulation={runPending}
          runError={runError ?? simulationResultError?.message ?? null}
          onRunSimulation={() => {
            void handleRunSimulation()
          }}
        />
      </LeftPane>

      <RightPane
        className={`animate-in slide-in-from-right-4 fade-in duration-300 ${
          activeSimulationId
            ? "w-[min(42rem,calc(100vw-28rem))] max-w-[calc(100vw-var(--spacing-pane)*2)]"
            : ""
        }`}
      >
        {activeSimulationId && activeSimulation ? (
          <div className="flex h-full flex-col gap-5">
            <div className="flex items-center justify-between pb-2">
              <button
                onClick={() => navigate(simulationBackHref)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="rotate-90" />
                Back to tile details
              </button>
              <button
                onClick={() => navigate("/")}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer"
              >
                Back to map
              </button>
            </div>

            <div className="flex-1 space-y-4">
              <div className="rounded-md border border-zinc-200 bg-white/60 p-4 shadow-sm">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Simulation
                </div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {tile?.name || "Untitled tile"}
                </div>
                {activePlan ? (
                  <div className="mt-2 text-[11px] text-zinc-600">
                    Management plan: <span className="font-medium text-zinc-900">{activePlan.name}</span>
                  </div>
                ) : null}
                <div className="mt-2 text-[10px] text-zinc-500 font-mono">{activeSimulationId}</div>
                {managementPlanByIdLoading ? (
                  <div className="mt-2 text-[11px] text-zinc-400 italic">Loading details...</div>
                ) : null}
              </div>

              {activeSimulationResult ? (
                <>
                  <div className="rounded-md border border-zinc-200 bg-white/60 p-4 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-900">Display mode</div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setBiomassVisualization("screenGrid")}
                        className={`flex-1 cursor-pointer rounded-md py-2 text-xs font-medium transition-colors ${
                          biomassVisualization === "screenGrid"
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-700 text-white hover:bg-zinc-600"
                        }`}
                      >
                        Heatmap
                      </button>
                      <button
                        type="button"
                        className="flex-1 rounded-md bg-zinc-700 py-2 text-xs font-medium text-white/70 opacity-70"
                        disabled
                      >
                        Video
                      </button>
                      <button
                        type="button"
                        onClick={() => setBiomassVisualization("h3Hexagon")}
                        className={`flex-1 cursor-pointer rounded-md py-2 text-xs font-medium transition-colors ${
                          biomassVisualization === "h3Hexagon"
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-700 text-white hover:bg-zinc-600"
                        }`}
                      >
                        Graph
                      </button>
                    </div>
                  </div>

                  <div className="rounded-md border border-zinc-200 bg-white/60 p-4 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setSpeciesSectionOpen((open) => !open)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
                    >
                      <div>
                        <div className="text-xs font-semibold text-zinc-900">
                          Functional groups
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {selectedSpeciesCount} of {activeSimulationSpecies.length} visible
                        </div>
                      </div>
                      <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        size={16}
                        className={`text-zinc-500 transition-transform ${
                          speciesSectionOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {speciesSectionOpen ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {activeSimulationSpecies.map((species, index) => {
                            const isSelected = selectedSpeciesList.includes(species)
                            return (
                              <button
                                key={species}
                                type="button"
                                onClick={() =>
                                  setSelectedSimulationSpecies((current) => {
                                    const base = current ?? activeSimulationSpecies
                                    return base.includes(species)
                                      ? base.filter((name) => name !== species)
                                      : [...base, species]
                                  })
                                }
                                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "border-zinc-900 bg-zinc-900 text-white"
                                    : "border-black/10 bg-white/80 text-zinc-700 hover:bg-white"
                                }`}
                              >
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor:
                                      speciesSwatchColors[index % speciesSwatchColors.length],
                                  }}
                                />
                                <span>{species}</span>
                              </button>
                            )
                          })}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedSimulationSpecies(activeSimulationSpecies)}
                            className="cursor-pointer rounded-md bg-zinc-900 py-2 text-xs font-medium text-white hover:bg-zinc-800"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedSimulationSpecies([])}
                            className="cursor-pointer rounded-md bg-zinc-700 py-2 text-xs font-medium text-white hover:bg-zinc-600"
                          >
                            None
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {activeSimulationSummary ? (
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-700">
                      <div className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-black/5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Frames
                        </div>
                        <div className="mt-1 font-semibold text-zinc-900">
                          {activeSimulationSummary.frameCount}
                        </div>
                      </div>
                      <div className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-black/5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Grid
                        </div>
                        <div className="mt-1 font-semibold text-zinc-900">
                          {activeSimulationSummary.width}x{activeSimulationSummary.height}
                        </div>
                      </div>
                      <div className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-black/5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Species
                        </div>
                        <div className="mt-1 font-semibold text-zinc-900">
                          {activeSimulationSummary.speciesCount}
                        </div>
                      </div>
                      <div className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-black/5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Sample Every
                        </div>
                        <div className="mt-1 font-semibold text-zinc-900">
                          {activeSimulationSummary.sampleEvery} steps
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <BiomassChart
                    result={activeSimulationResult}
                    height={360}
                    selectedSpecies={selectedSimulationSpecies}
                  />
                </>
              ) : (
                <div className="rounded-md border border-zinc-200 bg-white/60 p-4 text-xs text-zinc-500 shadow-sm">
                  Run simulation to see results.
                </div>
              )}
            </div>
          </div>
        ) : (
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
              status={tileStatus.label}
              statusTone={tileStatus.tone}
              createdDate={tile?.created?.substring(0, 10) || "2025-12-12"}
              managementPlansContent={
                <div className="space-y-3">
                  {tileManagementPlans.length ? (
                    <div className="space-y-2">
                      {tileManagementPlans.map((plan) => {
                        const isActive = activePlan?.id === plan.id
                        const taskCount = plan.expand?.tasks?.length ?? plan.tasks?.length ?? 0

                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() =>
                              navigate(
                                isActive
                                  ? `/tile/${tileId}`
                                  : `/tile/${tileId}/management-plan/${plan.id}`
                              )
                            }
                            className={`flex w-full cursor-pointer items-start justify-between rounded-md border px-3 py-2 text-left transition-colors ${
                              isActive
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-black/10 bg-white/70 hover:bg-white"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold">
                                {plan.name || "Untitled plan"}
                              </div>
                              <div
                                className={`mt-1 text-[10px] ${
                                  isActive ? "text-white/70" : "text-zinc-500"
                                }`}
                              >
                                {taskCount} activit{taskCount === 1 ? "y" : "ies"}
                              </div>
                            </div>
                            <div
                              className={`shrink-0 text-[10px] font-medium ${
                                isActive ? "text-white/80" : "text-zinc-400"
                              }`}
                            >
                              {isActive ? "Selected" : "Open"}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-black/10 bg-white/60 px-3 py-3 text-xs text-zinc-600">
                      No management plans found for this tile yet.
                    </div>
                  )}

                  {activePlan ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/tile/${tileId}`)}
                      className="w-full cursor-pointer rounded-md border border-black/10 bg-white/80 py-2 text-xs font-medium text-zinc-800 transition-colors hover:bg-white"
                    >
                      Clear selected plan
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => navigate(`/management-plans?tile=${tileId}`)}
                    className="w-full cursor-pointer rounded-md bg-zinc-800 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
                  >
                    Go to management plans
                  </button>
                </div>
              }
              landcoverContent={
                <div>
                  {!tile?.landcover ? (
                    <div className="text-xs text-zinc-500 italic">{landcoverStatusMessage(tile)}</div>
                  ) : selectedLandcover ? (
                    <div className="space-y-4">
                      <div className="aspect-square overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5">
                        {selectedLandcover.color_100 ||
                        selectedLandcover.color ||
                        selectedLandcover.texture_100 ||
                        selectedLandcover.texture ? (
                          <img
                            src={fileUrl(selectedLandcover, selectedLandcover.color_100 || selectedLandcover.color || selectedLandcover.texture_100 || selectedLandcover.texture) ?? ""}
                            alt="Landcover"
                            className="h-full w-full object-cover"
                            style={{ imageRendering: "pixelated" }}
                            onMouseEnter={() => {
                              const filename =
                                selectedLandcover.color_100 ||
                                selectedLandcover.color ||
                                selectedLandcover.texture_100 ||
                                selectedLandcover.texture
                              const url = fileUrl(selectedLandcover, filename)
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
                    <div className="text-xs text-zinc-500 animate-pulse">Loading landcover...</div>
                  )}
                </div>
              }
              oceanDataContent={
                <div>
                  {!tile?.oceanData ? (
                    <div className="text-xs text-zinc-500 italic">{oceanDataStatusMessage(tile)}</div>
                  ) : selectedOceanData ? (
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["depth", selectedOceanData.depth] as const,
                          ["elevation", selectedOceanData.surface_elevation] as const,
                          ["temp", selectedOceanData.water_temperature] as const,
                          ["velocity", selectedOceanData.water_velocity] as const,
                        ] as const
                      ).map(([label, filename]) => {
                        if (!filename) return null
                        const url = fileUrl(selectedOceanData, filename)
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
                    <div className="text-xs text-zinc-500 animate-pulse">Loading ocean data...</div>
                  )}
                </div>
              }
            />
          </div>
        )}
      </RightPane>

      {activeSimulationId && activeSimulationResult ? (
        <BottomPane className="left-[calc(var(--spacing-pane)+20rem+var(--spacing-pane))] right-[calc(var(--spacing-pane)+min(42rem,calc(100vw-28rem))+var(--spacing-pane))]">
          <div className="text-xs font-semibold text-zinc-900">Timeline</div>
          <div className="mt-2">
            <SimulationTimeline
              steps={activeSimulationResult.steps}
              episodeLength={activeSimulationResult.episode_length}
            />
          </div>
        </BottomPane>
      ) : null}
    </>
  )
}
