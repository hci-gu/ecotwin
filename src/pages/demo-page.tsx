import { BiomassChart } from "@/components/biomass-chart"
import { BottomPane } from "@/components/bottom-pane"
import { SimulationTimeline } from "@/components/simulation-timeline"
import { Button } from "@/components/ui/button"
import { demoConfig } from "@/config/demo-config"
import { managementPlanAreaLegendEntries } from "@/lib/management-plan-areas"
import { getSpeciesColor } from "@/lib/species-colors"
import { t } from "@/lib/translations"
import { cn } from "@/lib/utils"
import {
  createSimulationAtom,
  fetchManagementPlanByIdAtom,
  fetchSimulationResultByRecordIdAtom,
  fetchTileByIdAtom,
  managementPlanByIdCacheAtom,
  managementPlansAtom,
  selectedTileIdAtom,
  simulationResultByRecordIdAtom,
  simulationsAtom,
  refreshSimulationsAtom,
  tileByIdCacheAtom,
  tilesListAtom,
} from "@/state/ecotwin-atoms"
import type { Simulation, Task } from "@/state/ecotwin-types"
import {
  biomassVisualizationAtom,
  demoActiveSimulationIdAtom,
  selectedSimulationSpeciesAtom,
  visibleManagementPlanAreaIdsAtom,
} from "@/state/simulation-ui-state"
import { getActivityTypeLabel, marineSpecies } from "@/config/ecotwin-domain"
import { deleteSimulation } from "@/state/ecotwin-api"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  Clock01Icon,
  PlayIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"

type DemoScenario = "baseline" | "project"

const scenarioLabels: Record<DemoScenario, string> = {
  baseline: t("demo.nullAlternative"),
  project: t("demo.projectAlternative"),
}

const demoControlActivityTypes = {
  trawling: "trawlArea",
  noise: "windFarm",
  rotor: "seaLane",
} as const
const nullAlternativeDisabledTaskIds = ["2ozfhkbzh8d6oxi"]
const demoLeftRail = "calc(var(--spacing-pane) + 20rem + var(--spacing-pane))"
const demoTileWidth = "min(calc(100vh - 13rem), calc(100vw - var(--spacing-pane) * 4 - 20rem - 26rem))"
const demoRightPaneLeft = `calc(${demoLeftRail} + ${demoTileWidth} + var(--spacing-pane))`

function speciesIdForLayer(layer: string) {
  const normalized = layer.toLowerCase()
  return (
    marineSpecies.find(
      (species) =>
        species.id.toLowerCase() === normalized ||
        species.label.toLowerCase() === normalized
    )?.id ?? null
  )
}

const demoSpeciesLayers = demoConfig.mapLayers.filter((layer) => speciesIdForLayer(layer))

function toggleLayer(setter: Dispatch<SetStateAction<Set<string>>>, layer: string) {
  setter((prev) => {
    const next = new Set(prev)
    if (next.has(layer)) next.delete(layer)
    else next.add(layer)
    return next
  })
}

function taskData(task?: Task) {
  const value = task?.data
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value
}

function taskTimingLabel(task: Task) {
  const data = taskData(task)
  if (data?.timing === "constant") return t("common.constant")
  if (!task.start && !task.end) return t("common.constant")
  return [task.start?.slice(0, 10), task.end?.slice(0, 10)].filter(Boolean).join(" to ")
}

function stableDemoImpactValues(values: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, Math.max(0, Math.min(5, Number(value) || 0))] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  )
}

function demoCacheKey(args: {
  scenario: DemoScenario
  impactValues: Record<string, number>
  planTaskSignature: string
}) {
  return JSON.stringify({
    version: 6,
    scenario: args.scenario,
    impacts: stableDemoImpactValues(args.impactValues),
    years: demoConfig.simulation.lengthYears,
    runs: demoConfig.simulation.runs,
    planId: demoConfig.managementPlanId,
    planTasks: args.planTaskSignature,
  })
}

function stablePlanTaskSignature(tasks: Task[]) {
  return JSON.stringify(
    tasks
      .map((task) => ({
        id: task.id,
        type: task.type,
        start: task.start ?? "",
        end: task.end ?? "",
        data: task.data ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  )
}

function disabledTaskIdsForScenario(scenario: DemoScenario) {
  return scenario === "baseline" ? nullAlternativeDisabledTaskIds : []
}

function simulationOptions(simulation?: Simulation | null) {
  const options = simulation?.options
  if (!options || typeof options !== "object" || Array.isArray(options)) return {}
  return options as Record<string, unknown>
}

function isCompletedSimulation(simulation?: Simulation | null) {
  return Boolean(simulation?.resultJson || simulation?.resultNpz)
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

export function DemoPage() {
  const [scenario, setScenario] = useState<DemoScenario>(demoConfig.scenario)
  const [impactValues, setImpactValues] = useState(() =>
    Object.fromEntries(demoConfig.impactControls.map((control) => [control.id, control.value]))
  )
  const [enabledLayers, setEnabledLayers] = useState(
    () => new Set(demoConfig.mapLayers)
  )
  const [runPending, setRunPending] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const tiles = useAtomValue(tilesListAtom)
  const tileByIdCache = useAtomValue(tileByIdCacheAtom)
  const managementPlans = useAtomValue(managementPlansAtom)
  const managementPlanByIdCache = useAtomValue(managementPlanByIdCacheAtom)
  const simulations = useAtomValue(simulationsAtom)
  const simulationResults = useAtomValue(simulationResultByRecordIdAtom)
  const setSimulationResults = useSetAtom(simulationResultByRecordIdAtom)
  const [biomassVisualization, setBiomassVisualization] = useAtom(biomassVisualizationAtom)
  const selectedSpecies = useAtomValue(selectedSimulationSpeciesAtom)
  const setSelectedSpecies = useSetAtom(selectedSimulationSpeciesAtom)
  const setVisibleManagementPlanAreaIds = useSetAtom(visibleManagementPlanAreaIdsAtom)
  const [activeSimulationId, setActiveSimulationId] = useAtom(demoActiveSimulationIdAtom)
  const setSelectedTileId = useSetAtom(selectedTileIdAtom)
  const fetchTileById = useSetAtom(fetchTileByIdAtom)
  const fetchManagementPlanById = useSetAtom(fetchManagementPlanByIdAtom)
  const createSimulation = useSetAtom(createSimulationAtom)
  const fetchSimulationResultByRecordId = useSetAtom(fetchSimulationResultByRecordIdAtom)
  const refreshSimulations = useSetAtom(refreshSimulationsAtom)

  const tile = useMemo(() => {
    if (!demoConfig.tileId) return null
    return tiles?.items.find((item) => item.id === demoConfig.tileId) ?? tileByIdCache[demoConfig.tileId] ?? null
  }, [tileByIdCache, tiles?.items])

  const managementPlan = useMemo(() => {
    if (!demoConfig.managementPlanId) return null
    return (
      managementPlans?.find((plan) => plan.id === demoConfig.managementPlanId) ??
      managementPlanByIdCache[demoConfig.managementPlanId] ??
      null
    )
  }, [managementPlanByIdCache, managementPlans])

  const planTasks = useMemo(
    () => [...(managementPlan?.expand?.tasks ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [managementPlan?.expand?.tasks]
  )
  const disabledTaskIds = useMemo(() => disabledTaskIdsForScenario(scenario), [scenario])
  const effectivePlanTasks = useMemo(() => {
    if (!disabledTaskIds.length) return planTasks
    const disabled = new Set(disabledTaskIds)
    return planTasks.filter((task) => !disabled.has(task.id))
  }, [disabledTaskIds, planTasks])
  const planAreaEntries = useMemo(() => managementPlanAreaLegendEntries(effectivePlanTasks), [effectivePlanTasks])
  const planAreaIdsKey = useMemo(
    () => planAreaEntries.map((entry) => entry.id).join("|"),
    [planAreaEntries]
  )
  const [enabledPlanAreaIds, setEnabledPlanAreaIds] = useState<Set<string>>(() => new Set())
  const planTaskSignature = useMemo(() => stablePlanTaskSignature(effectivePlanTasks), [effectivePlanTasks])
  const demoActivityImpacts = useMemo(() => {
    const impacts: Record<string, number> = {}
    for (const [controlId, activityType] of Object.entries(demoControlActivityTypes)) {
      const value = impactValues[controlId] ?? 1
      impacts[activityType] = Math.max(0, Math.min(5, value))
    }
    return impacts
  }, [impactValues])

  useEffect(() => {
    const speciesIds = demoSpeciesLayers
      .filter((layer) => enabledLayers.has(layer))
      .map((layer) => speciesIdForLayer(layer))
      .filter((speciesId): speciesId is string => Boolean(speciesId))
    setSelectedSpecies(speciesIds)
  }, [enabledLayers, setSelectedSpecies])

  useEffect(() => {
    setEnabledPlanAreaIds(new Set(planAreaEntries.map((entry) => entry.id)))
  }, [planAreaIdsKey, planAreaEntries])

  useEffect(() => {
    setVisibleManagementPlanAreaIds([...enabledPlanAreaIds])
    return () => setVisibleManagementPlanAreaIds(null)
  }, [enabledPlanAreaIds, setVisibleManagementPlanAreaIds])
  const currentDemoCacheKey = useMemo(
    () => demoCacheKey({ scenario, impactValues, planTaskSignature }),
    [impactValues, planTaskSignature, scenario]
  )

  const cachedConfigSimulation = useMemo<Simulation | null>(() => {
    if (!demoConfig.managementPlanId) return null
    return (
      simulations?.find(
        (simulation) => {
          const options = simulationOptions(simulation)
          const isCurrentPlan =
            simulation.plan === demoConfig.managementPlanId ||
            simulation.expand?.plan?.id === demoConfig.managementPlanId
          return (
            isCurrentPlan &&
            options.demoCacheKey === currentDemoCacheKey &&
            isCompletedSimulation(simulation)
          )
        }
      ) ?? null
    )
  }, [currentDemoCacheKey, simulations])

  const activeSimulation = useMemo(() => {
    if (cachedConfigSimulation) return cachedConfigSimulation
    if (!activeSimulationId) return null
    const simulation = simulations?.find((item) => item.id === activeSimulationId) ?? null
    return simulationOptions(simulation).demoCacheKey === currentDemoCacheKey ? simulation : null
  }, [activeSimulationId, cachedConfigSimulation, currentDemoCacheKey, simulations])

  const activeResult = activeSimulation ? simulationResults[activeSimulation.id] ?? null : null
  const hasCachedCurrentConfig = Boolean(cachedConfigSimulation)

  function clearActiveSimulationForConfigChange() {
    setActiveSimulationId(null)
  }

  useEffect(() => {
    if (!demoConfig.tileId) return
    setSelectedTileId(demoConfig.tileId)
    void fetchTileById({ id: demoConfig.tileId }).catch(() => {})
    return () => setSelectedTileId(null)
  }, [fetchTileById, setSelectedTileId])

  useEffect(() => {
    if (!demoConfig.managementPlanId) return
    void fetchManagementPlanById({ id: demoConfig.managementPlanId }).catch(() => {})
  }, [fetchManagementPlanById])

  useEffect(() => {
    void refreshSimulations().catch(() => {})
  }, [refreshSimulations])

  useEffect(() => {
    if (!cachedConfigSimulation?.resultJson) {
      setActiveSimulationId(null)
      return
    }

    setActiveSimulationId(cachedConfigSimulation.id)
    void fetchSimulationResultByRecordId({
      simulationRecordId: cachedConfigSimulation.id,
      cachedOnly: true,
    }).catch(() => {})
  }, [
    cachedConfigSimulation?.id,
    cachedConfigSimulation?.resultJson,
    currentDemoCacheKey,
    fetchSimulationResultByRecordId,
    setActiveSimulationId,
  ])

  async function handleRunSimulation() {
    if (!demoConfig.managementPlanId) return
    setRunPending(true)
    setRunError(null)
    try {
      if (cachedConfigSimulation) {
        setActiveSimulationId(null)
        setSimulationResults((prev) => {
          const next = { ...prev }
          delete next[cachedConfigSimulation.id]
          return next
        })
        try {
          await deleteSimulation(cachedConfigSimulation.id)
        } catch (err) {
          if (!isNotFoundError(err)) throw err
        }
        await refreshSimulations()
      }

      const simulation = await createSimulation({
        planId: demoConfig.managementPlanId,
        options: {
          scenario,
          disabledTaskIds,
          demoCacheKey: currentDemoCacheKey,
          demoPlanTaskSignature: planTaskSignature,
          demoActivityImpacts,
          years: demoConfig.simulation.lengthYears,
          runs: demoConfig.simulation.runs,
        },
      })
      setActiveSimulationId(simulation.id)
      const result = await fetchSimulationResultByRecordId({
        simulationRecordId: simulation.id,
        options: {
          max_steps: demoConfig.simulation.lengthYears * 365,
          runs: demoConfig.simulation.runs,
        },
      })
      if (!result) {
        setRunError(t("demo.simulationFinishedWithoutResult"))
      }
      await refreshSimulations()
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunPending(false)
    }
  }

  return (
    <>
      <aside className="absolute bottom-pane left-pane top-[calc(var(--spacing-pane)*2+3.5rem)] z-30 flex w-80 flex-col gap-pane">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-pane border border-white/40 bg-white/82 shadow-2xl backdrop-blur-md">
          <div className="border-b border-zinc-200/80 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {t("demo.setup")}
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold text-zinc-950">
              {tile?.name || t("demo.configuredTile")}
            </h1>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {managementPlan?.name || t("demo.configuredManagementPlan")}
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-600">{t("demo.mainScenario")}</label>
              <div className="grid grid-cols-2 gap-2">
                {(["baseline", "project"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      clearActiveSimulationForConfigChange()
                      setScenario(value)
                    }}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-semibold transition",
                      scenario === value
                        ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                        : "border-zinc-200 bg-white/70 text-zinc-600 hover:bg-white"
                    )}
                  >
                    {scenarioLabels[value]}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-24 rounded-md border border-dashed border-zinc-200 bg-zinc-100/70" />

            <div className="space-y-4">
              {demoConfig.impactControls.map((control) => {
                const value = impactValues[control.id] ?? control.value
                return (
                  <div key={control.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white/75 px-3 py-2 text-sm shadow-sm">
                      <span className="font-semibold text-zinc-800">{control.label}</span>
                      <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                        {value}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={1}
                      value={value}
                      onChange={(event) => {
                        clearActiveSimulationForConfigChange()
                        setImpactValues((prev) => ({
                          ...prev,
                          [control.id]: Number(event.target.value),
                        }))
                      }}
                      className="w-full accent-zinc-800"
                    />
                    <div className="grid grid-cols-6 text-center text-[11px] text-zinc-400">
                      {[0, 1, 2, 3, 4, 5].map((mark) => (
                        <span key={mark}>{mark}</span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </aside>

      <section
        className="absolute top-[calc(var(--spacing-pane)*2+3.5rem)] z-30"
        style={{ left: demoLeftRail, width: demoTileWidth }}
      >
        <div className="flex max-w-full flex-col gap-2">
          <div className="inline-flex max-w-full items-center gap-2 overflow-x-auto rounded-pane border border-white/40 bg-white/82 px-3 py-2 shadow-xl backdrop-blur-md">
            <span className="shrink-0 pr-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {t("common.species")}
            </span>
            {demoSpeciesLayers.map((layer, index) => {
              const checked = enabledLayers.has(layer)
              return (
                <label
                  key={layer}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-white/70"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLayer(setEnabledLayers, layer)}
                    className="accent-zinc-800"
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: getSpeciesColor(layer, index).hex }}
                  />
                  <span>{layer}</span>
                </label>
              )
            })}
          </div>

          <div className="inline-flex max-w-full items-center gap-2 overflow-x-auto rounded-pane border border-white/40 bg-white/82 px-3 py-2 shadow-xl backdrop-blur-md">
            <span className="shrink-0 pr-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {t("common.areas")}
            </span>
            {planAreaEntries.length ? planAreaEntries.map((area) => {
              const checked = enabledPlanAreaIds.has(area.id)
              return (
                <label
                  key={area.id}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-white/70"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLayer(setEnabledPlanAreaIds, area.id)}
                    className="accent-zinc-800"
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: area.color }}
                  />
                  <span>{area.name}</span>
                </label>
              )
            }) : (
              <span className="shrink-0 px-2 py-1 text-xs font-medium text-zinc-400">
                {t("demo.noPlanAreas")}
              </span>
            )}
          </div>
        </div>
      </section>

      <aside
        className="absolute bottom-pane right-pane top-[calc(var(--spacing-pane)*2+3.5rem)] z-30 overflow-hidden rounded-pane border border-white/40 bg-white/86 shadow-2xl backdrop-blur-md"
        style={{ left: demoRightPaneLeft, right: "var(--spacing-pane)", width: "auto" }}
      >
        <div className="h-full overflow-auto [scrollbar-gutter:stable]">
          <div className="border-b border-zinc-200/80 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {t("common.simulation")}
                </div>
                <div className="mt-1 truncate text-lg font-semibold text-zinc-950">
                  {managementPlan?.name || t("demo.configuredManagementPlan")}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="inline-flex rounded-md border border-zinc-200 bg-white/75 p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setBiomassVisualization("screenGrid")}
                    className={cn(
                      "h-8 rounded px-2.5 text-xs font-semibold transition-colors",
                      biomassVisualization === "screenGrid"
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    )}
                  >
                    {t("tiles.heatmap")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBiomassVisualization("h3Hexagon")}
                    className={cn(
                      "h-8 rounded px-2.5 text-xs font-semibold transition-colors",
                      biomassVisualization === "h3Hexagon"
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    )}
                  >
                    {t("tiles.hexMap")}
                  </button>
                </div>
                <Button
                  type="button"
                  onClick={handleRunSimulation}
                  disabled={runPending || !demoConfig.managementPlanId}
                  className="gap-2 bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  <HugeiconsIcon icon={PlayIcon} size={16} />
                  {runPending ? t("demo.running") : hasCachedCurrentConfig ? t("demo.regenerate") : t("common.run")}
                </Button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-zinc-200 bg-white/70 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <HugeiconsIcon icon={Clock01Icon} size={13} />
                  {t("demo.length")}
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-950">
                  {t("demo.years", { count: demoConfig.simulation.lengthYears })}
                </div>
              </div>
              <div className="rounded-md border border-zinc-200 bg-white/70 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {t("common.simulations")}
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-950">
                  {t("demo.runs", { count: demoConfig.simulation.runs })}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4">
            {runError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {runError}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-md border border-zinc-200 bg-white/75 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
                <div className="text-sm font-semibold text-zinc-900">{t("demo.biomassTrend")}</div>
                <div className="text-[11px] font-medium text-zinc-500">
                  {activeResult ? t("demo.resultLoaded") : hasCachedCurrentConfig ? t("demo.loadingCachedResult") : t("demo.noCachedResult")}
                </div>
              </div>
              <div className="px-3 pb-3 pt-2">
                {activeResult ? (
                  <BiomassChart
                    result={activeResult}
                    height={300}
                    selectedSpecies={selectedSpecies}
                  />
                ) : (
                  <div className="grid h-[300px] place-items-center rounded-md bg-zinc-50 text-center text-xs text-zinc-500">
                    {t("demo.emptyChart")}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-zinc-200 bg-white/75 p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} />
                {t("demo.startingValues")}
              </div>
              <div className="mt-3 space-y-1.5">
                {demoConfig.startingValues.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 rounded bg-zinc-50/80 px-2.5 py-2 text-sm"
                  >
                    <span className="truncate text-zinc-600">{row.label}</span>
                    <span className="shrink-0 font-semibold text-zinc-950">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-zinc-200 bg-white/75 p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <HugeiconsIcon icon={Settings02Icon} size={16} />
                {t("demo.managementPlanActivities")}
              </div>
              <div className="mt-3 space-y-2">
                {effectivePlanTasks.length ? (
                  effectivePlanTasks.map((task) => (
                    <div key={task.id} className="rounded-md border border-zinc-100 bg-zinc-50/90 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">{task.name}</div>
                          <div className="text-xs text-zinc-500">{getActivityTypeLabel(task.type)}</div>
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-zinc-500">
                          {taskTimingLabel(task)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-3 text-xs text-zinc-500">
                    {t("demo.noActivitiesLoaded")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {activeResult ? (
        <BottomPane
          className="z-50 max-w-none overflow-visible"
          style={{ left: demoLeftRail, width: demoTileWidth }}
        >
          <SimulationTimeline
            steps={activeResult.steps}
            episodeLength={activeResult.episode_length}
            startDate={activeResult.start_date}
            endDate={activeResult.end_date}
            tickDurationDays={activeResult.tick_duration_days}
          />
        </BottomPane>
      ) : null}
    </>
  )
}
