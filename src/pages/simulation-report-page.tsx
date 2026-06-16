import { BiomassChart } from "@/components/biomass-chart"
import { Button } from "@/components/ui/button"
import {
  getActivityTypeLabel,
  getConstructionCategoryLabel,
  getSpeciesLabel,
  marineSpecies,
} from "@/config/ecotwin-domain"
import { summarizeSpecies } from "@/lib/simulation-result-summary"
import {
  formatArea,
  formatNumber,
  simulationResultRows,
  tileAreaKm2,
} from "@/lib/tile-metrics"
import {
  formatPlanDate,
  getManagementPlanDateRange,
  isConstantTask,
  parsePlanDate,
  taskOffsetsInPlan,
  type ManagementPlanDateRange,
} from "@/lib/management-plan-dates"
import {
  formatSimulationDate,
  formatSimulationDateForStep,
  formatSimulationDateRangeForSteps,
} from "@/lib/simulation-dates"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  fetchSimulationByIdAtom,
  fetchSimulationResultByRecordIdAtom,
  fetchTileByIdAtom,
  simulationByIdCacheAtom,
  simulationResultByRecordIdAtom,
  simulationResultErrorAtom,
  simulationResultLoadingAtom,
  simulationsAtom,
  tileByIdCacheAtom,
} from "@/state/ecotwin-atoms"
import type {
  ManagementPlan,
  Simulation,
  SimulationResultBase64,
  Task,
  TaskData,
  Tile,
} from "@/state/ecotwin-types"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { t } from "@/lib/translations"

function taskData(task?: Task): TaskData | undefined {
  const value = task?.data
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value
}

function formatDate(value?: string) {
  return value?.substring(0, 10) || t("common.unknownDate")
}

function simulationStatus(simulation?: Simulation | null) {
  if (!simulation) return t("common.unknown")
  if (simulation.status) return simulation.status
  if (simulation.resultJson || simulation.resultNpz) return "completed"
  return "pending"
}

function taskTiming(task: Task) {
  const timing = taskData(task)?.timing
  if (timing === "constant") return t("common.constant")
  if (timing === "scheduled") return `${formatDate(task.start)} to ${formatDate(task.end)}`
  return task.start || task.end ? `${formatDate(task.start)} to ${formatDate(task.end)}` : t("common.constant")
}

function activitySummary(task: Task) {
  const data = taskData(task)
  const lines = [
    t("report.activityNameWithType", { name: task.name || t("common.untitledActivity"), type: getActivityTypeLabel(task.type) }),
    t("managementPlans.timingPrefix", { timing: taskTiming(task) }),
    data?.targetScope ? `${t("managementPlans.targetScope")}: ${data.targetScope}` : null,
    data?.areaSummary?.areaKm2
      ? `${t("common.area")}: ${formatArea(data.areaSummary.areaKm2)}`
      : null,
    data?.objective ? `${t("managementPlans.targetObjective")}: ${data.objective}` : null,
    data?.description ? `${t("common.details")}: ${data.description}` : null,
  ].filter((value): value is string => Boolean(value))

  if (task.type === "fishing" && data?.speciesEffortMultipliers) {
    for (const species of marineSpecies) {
      const value = data.speciesEffortMultipliers[species.id]
      if (typeof value === "number") {
        lines.push(`${species.label} effort multiplier: ${value}`)
      }
    }
  }

  if (task.type === "construction" && data?.construction) {
    if (data.construction.category) {
      lines.push(`Construction category: ${getConstructionCategoryLabel(data.construction.category)}`)
    }
    if (typeof data.construction.intensity === "number") {
      lines.push(`Construction intensity: ${data.construction.intensity}`)
    }
    if (data.construction.description) {
      lines.push(`Construction description: ${data.construction.description}`)
    }
  }

  return lines
}

function reportFilename(tile?: Tile | null, simulation?: Simulation | null) {
  const tileName = tile?.name?.trim() || "tile"
  const safeTile = tileName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const date = new Date().toISOString().slice(0, 10)
  return `ecotwin-${safeTile || "tile"}-${simulation?.id ?? "simulation"}-${date}.pdf`
}

function activityAccent(type: Task["type"]) {
  if (type === "fishing") {
    return {
      backgroundColor: "#dff2ff",
      borderColor: "#0b7db3",
      color: "#075985",
    }
  }
  if (type === "windFarm") {
    return {
      backgroundColor: "#dcfce7",
      borderColor: "#16a34a",
      color: "#166534",
    }
  }
  if (type === "seaLane") {
    return {
      backgroundColor: "#dbeafe",
      borderColor: "#2563eb",
      color: "#1d4ed8",
    }
  }
  if (type === "trawlArea") {
    return {
      backgroundColor: "#ffe4e6",
      borderColor: "#e11d48",
      color: "#be123c",
    }
  }

  return {
    backgroundColor: "#ffedd5",
    borderColor: "#ea580c",
    color: "#9a3412",
  }
}

function taskTypeLabel(type: Task["type"]) {
  return getActivityTypeLabel(type)
}

function inputNumber(input: unknown, key: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const value = (input as Record<string, unknown>)[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function inputString(input: unknown, key: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const value = (input as Record<string, unknown>)[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function timelineRangeFromSimulationInput(
  input: unknown,
  tasks: Task[],
  result?: SimulationResultBase64 | null
): ManagementPlanDateRange | null {
  const taskRange = getManagementPlanDateRange(tasks)
  const startDate = inputString(input, "planStart") ?? taskRange?.startDate
  const endDate = inputString(input, "planEnd") ?? taskRange?.endDate
  if (!startDate || !endDate) return taskRange

  const start = parsePlanDate(startDate)
  const end = parsePlanDate(endDate)
  if (!start || !end) return taskRange

  const tickDurationDays =
    inputNumber(input, "tickDurationDays") ??
    result?.tick_duration_days ??
    taskRange?.tickDurationDays ??
    1
  const durationDays =
    inputNumber(input, "durationDays") ??
    taskRange?.durationDays ??
    Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    )
  const simulationTicks =
    inputNumber(input, "simulationTicks") ??
    result?.episode_length ??
    taskRange?.simulationTicks ??
    Math.max(1, Math.ceil(durationDays / tickDurationDays))
  const sampleEvery =
    inputNumber(input, "sampleEvery") ??
    result?.sample_every ??
    taskRange?.sampleEvery ??
    1

  return {
    startDate: formatPlanDate(startDate),
    endDate: formatPlanDate(endDate),
    durationDays,
    tickDurationDays,
    simulationTicks,
    sampleEvery,
  }
}

function ManagementPlanTimeline({
  tasks,
  range,
}: {
  tasks: Task[]
  range: ManagementPlanDateRange | null
}) {
  const timelineRows = useMemo(() => {
    if (!range) {
      return {
        rangeLabel: t("report.noDatedActivities"),
        rows: tasks.map((task, index) => ({
          task,
          left: tasks.length ? (index / tasks.length) * 100 : 0,
          width: tasks.length ? 100 / tasks.length : 100,
          dateLabel: isConstantTask(task) ? t("common.constant") : t("common.unscheduled"),
          accent: activityAccent(task.type),
        })),
      }
    }

    const rangeLabel = `${range.startDate} to ${range.endDate} · ${range.durationDays} days`

    return {
      rangeLabel,
      rows: tasks.map((task) => {
        const offsets = taskOffsetsInPlan(task, range)
        const startDay = offsets?.startDay ?? 0
        const endDay = offsets?.endDay ?? range.durationDays
        const startRatio = startDay / range.durationDays
        const endRatio = endDay / range.durationDays
        const left = Math.max(0, Math.min(startRatio, endRatio) * 100)
        const width = Math.max(
          2,
          Math.min(100 - left, Math.abs(endRatio - startRatio) * 100)
        )

        return {
          task,
          left,
          width,
          dateLabel: offsets
            ? formatSimulationDateRangeForSteps(
                offsets.startTick,
                offsets.endTick,
                range.startDate,
                range.tickDurationDays
              ) ?? `${formatPlanDate(task.start)} to ${formatPlanDate(task.end)}`
            : t("common.unscheduled"),
          accent: activityAccent(task.type),
        }
      }),
    }
  }, [range, tasks])

  return (
    <div className="rounded-md bg-white/70 p-3 ring-1 ring-black/5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-xs font-semibold text-zinc-900">{t("report.managementPlanTimeline")}</div>
        <div className="text-[11px] text-zinc-600">{timelineRows.rangeLabel}</div>
      </div>

      <div className="mt-4 space-y-3">
        {timelineRows.rows.length ? (
          timelineRows.rows.map(({ task, left, width, dateLabel, accent }) => (
            <div key={task.id} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-zinc-900">{task.name || t("common.untitledActivity")}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {taskTypeLabel(task.type)} · {taskTiming(task)}
                </div>
                <div className="mt-0.5 text-[10px] text-zinc-400">{dateLabel}</div>
              </div>
              <div>
                <div className="grid grid-cols-[44px_1fr_14px]">
                  <div />
                  <div className="relative h-9 rounded-md bg-zinc-100 ring-1 ring-inset ring-zinc-200">
                    <div
                      className="absolute top-2 h-5 rounded-md border"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: accent.backgroundColor,
                        borderColor: accent.borderColor,
                      }}
                    />
                  </div>
                  <div />
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500">
            {t("report.noActivities")}
          </div>
        )}
      </div>
    </div>
  )
}

export function SimulationReportPage() {
  const { tileId, simulationId } = useParams<{ tileId: string; simulationId: string }>()
  const navigate = useNavigate()
  const simulations = useAtomValue(simulationsAtom)
  const simulationByIdCache = useAtomValue(simulationByIdCacheAtom)
  const tileByIdCache = useAtomValue(tileByIdCacheAtom)
  const simulationResultByRecordId = useAtomValue(simulationResultByRecordIdAtom)
  const simulationResultLoading = useAtomValue(simulationResultLoadingAtom)
  const simulationResultError = useAtomValue(simulationResultErrorAtom)
  const fetchSimulationById = useSetAtom(fetchSimulationByIdAtom)
  const fetchTileById = useSetAtom(fetchTileByIdAtom)
  const fetchSimulationResultByRecordId = useSetAtom(fetchSimulationResultByRecordIdAtom)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const simulation = useMemo(() => {
    if (!simulationId) return null
    return simulations?.find((item) => item.id === simulationId) ?? simulationByIdCache[simulationId] ?? null
  }, [simulationByIdCache, simulationId, simulations])

  const plan = simulation?.expand?.plan as ManagementPlan | undefined
  const tile = plan?.expand?.tile ?? (tileId ? tileByIdCache[tileId] : null)
  const result = simulationId ? simulationResultByRecordId[simulationId] ?? null : null
  const tasks = useMemo(() => plan?.expand?.tasks ?? [], [plan?.expand?.tasks])

  useEffect(() => {
    if (!simulationId || simulation) return
    void fetchSimulationById({ id: simulationId })
  }, [fetchSimulationById, simulation, simulationId])

  useEffect(() => {
    if (!tileId || tile) return
    void fetchTileById({ id: tileId })
  }, [fetchTileById, tile, tileId])

  useEffect(() => {
    if (!simulationId || result || !simulation?.resultJson || simulationResultLoading) return
    void fetchSimulationResultByRecordId({
      simulationRecordId: simulationId,
      cachedOnly: true,
    }).catch(() => {})
  }, [
    fetchSimulationResultByRecordId,
    result,
    simulation?.resultJson,
    simulationId,
    simulationResultLoading,
  ])

  const resultRows = useMemo(() => simulationResultRows(result), [result])
  const speciesSummaries = useMemo(() => summarizeSpecies(result), [result])
  const timelineRange = useMemo(
    () => timelineRangeFromSimulationInput(simulation?.inputJson, tasks, result),
    [result, simulation?.inputJson, tasks]
  )
  const finalSnapshotLabel = useMemo(() => {
    const lastStep = result?.steps?.at(-1)
    if (typeof lastStep === "number") {
      return (
        formatSimulationDateForStep(
          lastStep,
          result?.start_date,
          result?.tick_duration_days
        ) ?? formatSimulationDate(result?.end_date)
      )
    }
    return formatSimulationDate(result?.end_date)
  }, [result])

  function handleExportPdf() {
    if (!simulation || !result) {
      setExportError(t("report.loadCompletedBeforeExport"))
      return
    }
    setExporting(true)
    setExportError(null)
    try {
      const previousTitle = document.title
      document.title = reportFilename(tile, simulation).replace(/\.pdf$/i, "")
      window.setTimeout(() => {
        window.print()
        document.title = previousTitle
        setExporting(false)
      }, 0)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
      setExporting(false)
    }
  }

  return (
    <section className="simulation-report-page absolute inset-x-0 bottom-0 top-[4.5rem] z-30 overflow-auto bg-white p-pane">
      <div className="simulation-report-document mx-auto max-w-5xl bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate(tileId && simulationId ? `/tile/${tileId}/simulation/${simulationId}` : "/simulations")}
              className="report-print-hidden inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-950"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
              {t("report.backToResults")}
            </button>
            <h1 className="mt-4 text-3xl font-medium text-zinc-950">{t("report.title")}</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {tile?.name || t("common.unknownTile")} · {plan?.name || t("common.unknownPlan")}
            </p>
          </div>
          <Button
            type="button"
            disabled={exporting || !result}
            onClick={handleExportPdf}
            className="report-print-hidden rounded-lg bg-zinc-900 px-4 text-white hover:bg-zinc-800"
          >
            {exporting ? t("common.exporting") : t("common.exportPdf")}
          </Button>
        </div>

        {simulationResultError ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {t("report.failedToLoadResult", { message: simulationResultError.message })}
          </div>
        ) : null}

        {exportError ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {exportError}
          </div>
        ) : null}

        <div className="report-no-break mt-10 grid gap-8 border-y border-zinc-200 py-6 lg:grid-cols-[16rem_1fr]">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {t("report.contents")}
            </h2>
            <div className="mt-4 space-y-2 text-sm">
              {[
                ["01", t("report.overview")],
                ["02", t("report.managementPlan")],
                ["03", t("report.results")],
                ["04", t("report.biomassAndTimeline")],
              ].map(([number, label]) => (
                <div key={number} className="flex items-baseline gap-3">
                  <span className="w-7 text-xs font-semibold text-zinc-400">{number}</span>
                  <span className="flex-1 border-b border-dotted border-zinc-300" />
                  <span className="font-medium text-zinc-800">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-950">{t("report.executiveSummary")}</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-600">
              <p>
                {t("report.summaryParagraph1")}
              </p>
              <p>
                {t("report.summaryParagraph2")}
              </p>
            </div>
          </div>
        </div>

        <div id="simulation-overview" className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-950">01 {t("report.overview")}</h2>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t("common.simulation"), simulation?.id ?? t("common.loading")],
            [t("common.status"), simulationStatus(simulation)],
            [t("common.tileArea"), formatArea(tileAreaKm2(tile)) ?? t("common.unknown")],
            [t("common.created"), formatDate(simulation?.created)],
          ].map(([label, value]) => (
            <div key={label} className="report-no-break rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
              <div className="mt-2 break-words text-sm font-medium text-zinc-900">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div id="management-plan">
            <h2 className="text-lg font-semibold text-zinc-950">02 {t("report.managementPlan")}</h2>
            <div className="mt-4 space-y-4">
              {tasks.length ? (
                tasks.map((task) => (
                  <div key={task.id} className="report-no-break rounded-lg border border-zinc-200 bg-white p-4">
                    {activitySummary(task).map((line) => (
                      <div key={line} className="text-sm leading-6 text-zinc-700">
                        {line}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                  {t("report.noActivities")}
                </div>
              )}
            </div>
          </div>

          <div id="results">
            <h2 className="text-lg font-semibold text-zinc-950">03 {t("report.results")}</h2>
            <div className="mt-4">
              {result ? (
                <BiomassChart result={result} height={300} />
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                  {simulationResultLoading ? t("report.loadingSimulationResult") : t("report.noCompletedResult")}
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {resultRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2">
                  <span className="text-zinc-500">{row.label}</span>
                  <span className="font-medium text-zinc-900">{row.value}</span>
                </div>
              ))}
            </div>
            {speciesSummaries.length ? (
              <div className="report-no-break mt-6">
                <h3 className="text-sm font-semibold text-zinc-950">{t("report.speciesSummaries")}</h3>
                <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
                        <th className="px-3 py-2 font-medium">{t("common.species")}</th>
                        <th className="px-3 py-2 font-medium">{t("common.initial")}</th>
                        <th className="px-3 py-2 font-medium">{t("common.final")}</th>
                        <th className="px-3 py-2 font-medium">{t("common.change")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {speciesSummaries.map((summary) => (
                        <tr key={summary.name} className="border-b border-zinc-100 last:border-b-0">
                          <td className="px-3 py-2 text-zinc-700">{getSpeciesLabel(summary.name)}</td>
                          <td className="px-3 py-2 text-zinc-700">{formatNumber(summary.initialTotal, 0)}</td>
                          <td className="px-3 py-2 text-zinc-700">{formatNumber(summary.finalTotal, 0)}</td>
                          <td className="px-3 py-2 text-zinc-700">{formatNumber(summary.change, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                  {t("report.finalResultSnapshot", { sample: finalSnapshotLabel ?? t("report.finalSample") })}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div id="biomass-timeline" className="report-print-break mt-8">
          <h2 className="text-lg font-semibold text-zinc-950">04 {t("report.biomassAndTimeline")}</h2>
          <div className="report-no-break mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            {result ? (
              <BiomassChart result={result} height={260} />
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                {simulationResultLoading ? t("report.loadingSimulationResult") : t("report.noCompletedResult")}
              </div>
            )}
            <div className="mt-4">
              <ManagementPlanTimeline tasks={tasks} range={timelineRange} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
