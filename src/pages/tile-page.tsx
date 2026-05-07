import { LeftPane } from "@/components/left-pane"
import { GlassPane } from "@/components/glass-pane"
import { ActionsPane } from "@/components/actions-pane"
import { SimulationList } from "@/components/simulation-list"
import { TileDetails } from "@/components/tile-details"
import { RightPane } from "@/components/right-pane"
import { BiomassChart } from "@/components/biomass-chart"
import { BottomPane } from "@/components/bottom-pane"
import { SimulationTimeline } from "@/components/simulation-timeline"
import { DetailRows } from "@/components/detail-rows"
import {
  activityTypeOptions,
  constructionCategories,
  getSpeciesLabel,
  marineSpecies,
} from "@/config/ecotwin-domain"
import {
  hasActiveTileGeneration,
  landcoverStatusMessage,
  oceanDataStatusMessage,
  tilePrimaryStatus,
} from "@/lib/tile-population"
import {
  formatArea,
  formatAssetStatus,
  formatMetersPerPixel,
  simulationResultRows,
  tileAreaKm2,
  type DetailRow,
} from "@/lib/tile-metrics"
import {
  deleteManagementPlan,
  deleteSimulation,
  deleteTile,
  fileUrl,
  updateTile,
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

function isNotFoundError(err: unknown) {
  if (!err || typeof err !== "object") return false
  const maybeError = err as { status?: unknown; message?: unknown }
  return (
    maybeError.status === 404 ||
    (typeof maybeError.message === "string" &&
      maybeError.message.toLowerCase().includes("wasn't found"))
  )
}

async function deleteIfPresent(deleteRecord: (id: string) => Promise<unknown>, id: string) {
  try {
    await deleteRecord(id)
  } catch (err) {
    if (!isNotFoundError(err)) throw err
  }
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
    refreshTiles,
    refreshManagementPlans,
    refreshSimulations,
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
  const [tileEditOpen, setTileEditOpen] = useState(false)
  const [tileNameDraft, setTileNameDraft] = useState("")
  const [tileSavePending, setTileSavePending] = useState(false)
  const [tileSaveError, setTileSaveError] = useState<string | null>(null)
  const [tileDeleteOpen, setTileDeleteOpen] = useState(false)
  const [tileDeletePending, setTileDeletePending] = useState(false)
  const [tileDeleteError, setTileDeleteError] = useState<string | null>(null)
  const [simulationDeleteOpen, setSimulationDeleteOpen] = useState(false)
  const [simulationDeletePending, setSimulationDeletePending] = useState(false)
  const [simulationDeleteError, setSimulationDeleteError] = useState<string | null>(null)
  const [resultsMessage, setResultsMessage] = useState<string | null>(null)

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

  const tilePlanIds = useMemo(
    () => new Set(tileManagementPlans.map((plan) => plan.id)),
    [tileManagementPlans]
  )

  const tileSimulations = useMemo(() => {
    if (!tilePlanIds.size) return []
    return (simulations ?? []).filter((simulation) => {
      const simPlanId = simulation.expand?.plan?.id ?? simulation.plan
      return !!simPlanId && tilePlanIds.has(simPlanId)
    })
  }, [simulations, tilePlanIds])

  const activePlanSimulations = useMemo(() => {
    if (!activePlan) return tileSimulations
    return tileSimulations.filter((simulation) => {
      const simPlanId = simulation.expand?.plan?.id ?? simulation.plan
      return simPlanId === activePlan.id
    })
  }, [activePlan, tileSimulations])

  const latestCompletedSimulation = useMemo(() => {
    return activePlanSimulations.find(
      (simulation) =>
        simulation.resultJson ||
        simulation.resultNpz ||
        simulation.status === "completed"
    ) ?? null
  }, [activePlanSimulations])

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

  useEffect(() => {
    setTileNameDraft(tile?.name ?? "")
  }, [tile?.id, tile?.name])

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

  const planValidationError = useMemo(() => {
    if (!activePlan) return "Select a management plan for this tile before running a simulation."
    if (!tile?.landcover) return landcoverStatusMessage(tile)
    if (!tile?.oceanData) return oceanDataStatusMessage(tile)

    const tasks = activePlan.expand?.tasks ?? []
    if (!tasks.length) return "Add at least one activity to this management plan before running a simulation."

    for (const task of tasks) {
      const data = task.data
      const supportedTaskType = activityTypeOptions.some((option) => option.id === task.type)
      if (!supportedTaskType) {
        return `${task.name || "An activity"} uses an unsupported activity type.`
      }

      const timing =
        data?.timing === "constant" || (!task.start && !task.end) ? "constant" : "scheduled"
      if (timing === "scheduled" && (!task.start || !task.end)) {
        return `${task.name || "An activity"} needs a start and end date, or should be marked constant.`
      }

      const targetScope = data?.targetScope
      if (targetScope !== "wholeTile" && targetScope !== "polygon") {
        return `${task.name || "An activity"} is missing a target scope.`
      }
      if (targetScope === "polygon" && !data?.area) {
        return `${task.name || "An activity"} needs a polygon area before simulation.`
      }

      if (task.type === "fishing") {
        const multipliers = data?.speciesEffortMultipliers
        if (!multipliers || typeof multipliers !== "object") {
          return `${task.name || "Fishing activity"} needs per-species effort multipliers.`
        }
        for (const species of marineSpecies) {
          const value = multipliers[species.id]
          if (value === undefined) continue
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            return `${task.name || "Fishing activity"} has an invalid ${species.label} effort multiplier.`
          }
        }
      }

      if (task.type === "construction") {
        const construction = data?.construction
        const validCategory = constructionCategories.some(
          (category) => category.id === construction?.category
        )
        if (!validCategory) {
          return `${task.name || "Construction activity"} needs a construction category.`
        }
        if (
          typeof construction?.intensity !== "number" ||
          !Number.isFinite(construction.intensity) ||
          construction.intensity < 0
        ) {
          return `${task.name || "Construction activity"} needs a non-negative intensity.`
        }
      }
    }

    return null
  }, [activePlan, tile])

  const canRunSimulation = !planValidationError
  const simulationBackHref =
    tileId && activePlan?.id
      ? `/tile/${tileId}/management-plan/${activePlan.id}`
      : tileId
        ? `/tile/${tileId}`
        : "/"

  async function handleRunSimulation() {
    if (!tileId || !activePlan) return
    if (planValidationError) {
      setRunError(planValidationError)
      return
    }

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

  async function handleSaveTile() {
    if (!tile) return
    const name = tileNameDraft.trim()
    if (!name) {
      setTileSaveError("Enter a tile name before saving.")
      return
    }

    setTileSavePending(true)
    setTileSaveError(null)
    try {
      await updateTile(tile.id, { name })
      await fetchTileById({ id: tile.id })
      await refreshTiles()
      setTileEditOpen(false)
    } catch (err) {
      setTileSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setTileSavePending(false)
    }
  }

  async function handleDeleteTile() {
    if (!tile) return

    setTileDeletePending(true)
    setTileDeleteError(null)
    try {
      const plansToDelete = tileManagementPlans
      const planIdSet = new Set(plansToDelete.map((plan) => plan.id))
      const simulationsToDelete = (simulations ?? []).filter((simulation) => {
        const simPlanId = simulation.expand?.plan?.id ?? simulation.plan
        return !!simPlanId && planIdSet.has(simPlanId)
      })

      await Promise.all(
        simulationsToDelete.map((simulation) =>
          deleteIfPresent(deleteSimulation, simulation.id)
        )
      )
      await Promise.all(
        plansToDelete.map((plan) => deleteIfPresent(deleteManagementPlan, plan.id))
      )
      await deleteIfPresent(deleteTile, tile.id)

      setSelectedTileId(null)
      setHoveredTileId(null)
      await Promise.all([refreshTiles(), refreshManagementPlans(), refreshSimulations()])
      navigate("/")
    } catch (err) {
      setTileDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setTileDeletePending(false)
    }
  }

  async function handleDeleteActiveSimulation() {
    if (!activeSimulationId) return

    setSimulationDeletePending(true)
    setSimulationDeleteError(null)
    try {
      await deleteIfPresent(deleteSimulation, activeSimulationId)
      await refreshSimulations()
      setSimulationDeleteOpen(false)
      navigate(simulationBackHref)
    } catch (err) {
      setSimulationDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setSimulationDeletePending(false)
    }
  }

  function handleShowResults() {
    const target = activeSimulation ?? latestCompletedSimulation
    if (target?.id && (activeSimulationResult || target.resultJson || target.resultNpz)) {
      navigate(`/tile/${tileId}/simulation/${target.id}`)
      setResultsMessage(null)
      return
    }

    setResultsMessage("Run a simulation before opening results for this plan.")
  }

  function handleExportReport() {
    const target = activeSimulation ?? latestCompletedSimulation
    if (target?.id && (activeSimulationResult || target.resultJson || target.resultNpz)) {
      navigate(`/tile/${tileId}/simulation/${target.id}/report`)
      setResultsMessage(null)
      return
    }

    setResultsMessage("Run a completed simulation before exporting a report.")
  }

  const tileDetailRows = useMemo<DetailRow[]>(() => {
    if (!tile) return []
    return [
      formatArea(tileAreaKm2(tile)) ? { label: "Area", value: formatArea(tileAreaKm2(tile))! } : null,
      formatMetersPerPixel(tile.metersPerPixel)
        ? { label: "Resolution", value: formatMetersPerPixel(tile.metersPerPixel)! }
        : null,
      {
        label: "Landcover",
        value: formatAssetStatus(tile.landcoverStatus, Boolean(tile.landcover)) ?? "Not linked",
      },
      {
        label: "Ocean data",
        value: formatAssetStatus(tile.oceanDataStatus, Boolean(tile.oceanData)) ?? "Not linked",
      },
      { label: "Management plans", value: String(tileManagementPlans.length) },
      { label: "Simulations", value: String(tileSimulations.length) },
      ...simulationResultRows(activeSimulationResult),
    ].filter((row): row is DetailRow => Boolean(row))
  }, [activeSimulationResult, tile, tileManagementPlans.length, tileSimulations.length])

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
          runDisabledReason={planValidationError}
          resultsMessage={resultsMessage}
          onRunSimulation={() => {
            void handleRunSimulation()
          }}
          onEdit={tile ? () => setTileEditOpen(true) : undefined}
          canShowResults={Boolean(
            (activeSimulation && (activeSimulationResult || activeSimulation.resultJson || activeSimulation.resultNpz)) ||
              latestCompletedSimulation
          )}
          onShowResults={handleShowResults}
          canExport={Boolean(
            (activeSimulation && (activeSimulationResult || activeSimulation.resultJson || activeSimulation.resultNpz)) ||
              latestCompletedSimulation
          )}
          onExport={handleExportReport}
          onDelete={tile ? () => setTileDeleteOpen(true) : undefined}
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
                <button
                  type="button"
                  onClick={() => setSimulationDeleteOpen(true)}
                  className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
                >
                  Delete simulation
                </button>
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
                        onClick={() => setBiomassVisualization("h3Hexagon")}
                        className={`flex-1 cursor-pointer rounded-md py-2 text-xs font-medium transition-colors ${
                          biomassVisualization === "h3Hexagon"
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-700 text-white hover:bg-zinc-600"
                        }`}
                      >
                        3D hex map
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
                          Species
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
                                <span>{getSpeciesLabel(species)}</span>
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
                          Samples
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
              createdDate={tile?.created?.substring(0, 10) || "Unknown date"}
              simulationInfoContent={<DetailRows rows={tileDetailRows} />}
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
              startDate={activeSimulationResult.start_date}
              endDate={activeSimulationResult.end_date}
              tickDurationDays={activeSimulationResult.tick_duration_days}
            />
          </div>
        </BottomPane>
      ) : null}

      {tileEditOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold text-zinc-950">Edit tile</div>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Tile name
            </label>
            <input
              value={tileNameDraft}
              onChange={(event) => {
                setTileNameDraft(event.target.value)
                setTileSaveError(null)
              }}
              className="mt-2 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-900"
            />
            {tileSaveError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {tileSaveError}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTileEditOpen(false)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={tileSavePending}
                onClick={() => void handleSaveTile()}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {tileSavePending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tileDeleteOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold text-zinc-950">Delete tile</div>
            <div className="mt-3 text-sm leading-6 text-zinc-600">
              This will delete {tile?.name || "this tile"} and cascade through{" "}
              {tileManagementPlans.length} management plan
              {tileManagementPlans.length === 1 ? "" : "s"} and {tileSimulations.length} simulation
              {tileSimulations.length === 1 ? "" : "s"}.
            </div>
            {tileDeleteError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {tileDeleteError}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTileDeleteOpen(false)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={tileDeletePending}
                onClick={() => void handleDeleteTile()}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                {tileDeletePending ? "Deleting..." : "Delete tile"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {simulationDeleteOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold text-zinc-950">Delete simulation</div>
            <div className="mt-3 text-sm leading-6 text-zinc-600">
              This will delete simulation {activeSimulationId} and any cached result files stored on
              the record.
            </div>
            {simulationDeleteError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {simulationDeleteError}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSimulationDeleteOpen(false)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={simulationDeletePending}
                onClick={() => void handleDeleteActiveSimulation()}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                {simulationDeletePending ? "Deleting..." : "Delete simulation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
