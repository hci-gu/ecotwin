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
import type { ManagementPlan, Simulation, Task, TaskData, Tile } from "@/state/ecotwin-types"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

function taskData(task?: Task): TaskData | undefined {
  const value = task?.data
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value
}

function formatDate(value?: string) {
  return value?.substring(0, 10) || "Unknown date"
}

function simulationStatus(simulation?: Simulation | null) {
  if (!simulation) return "Unknown"
  if (simulation.status) return simulation.status
  if (simulation.resultJson || simulation.resultNpz) return "completed"
  return "pending"
}

function taskTiming(task: Task) {
  const timing = taskData(task)?.timing
  if (timing === "constant") return "Constant"
  if (timing === "scheduled") return `${formatDate(task.start)} to ${formatDate(task.end)}`
  return task.start || task.end ? `${formatDate(task.start)} to ${formatDate(task.end)}` : "Constant"
}

function activitySummary(task: Task) {
  const data = taskData(task)
  const lines = [
    `${task.name || "Untitled activity"} (${getActivityTypeLabel(task.type)})`,
    `Timing: ${taskTiming(task)}`,
    data?.targetScope ? `Target scope: ${data.targetScope}` : null,
    data?.areaSummary?.areaKm2
      ? `Area: ${formatArea(data.areaSummary.areaKm2)}`
      : null,
    data?.objective ? `Objective: ${data.objective}` : null,
    data?.description ? `Description: ${data.description}` : null,
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

function parseTimelineDate(value?: string) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function taskTypeLabel(type: Task["type"]) {
  return getActivityTypeLabel(type)
}

function ManagementPlanTimeline({ tasks }: { tasks: Task[] }) {
  const timelineRows = useMemo(() => {
    const rows = tasks.map((task, index) => ({
      task,
      index,
      startDate: parseTimelineDate(task.start),
      endDate: parseTimelineDate(task.end ?? task.start),
    }))
    const validDates = rows.flatMap((row) =>
      [row.startDate, row.endDate].filter((date): date is Date => Boolean(date))
    )
    const minTime = validDates.length ? Math.min(...validDates.map((date) => date.getTime())) : 0
    const maxTime = validDates.length ? Math.max(...validDates.map((date) => date.getTime())) : 1
    const timeSpan = maxTime === minTime ? 1 : maxTime - minTime

    return {
      rangeLabel: validDates.length
        ? `${new Date(minTime).toISOString().slice(0, 10)} to ${new Date(maxTime).toISOString().slice(0, 10)}`
        : "No dated activities",
      rows: rows.map((row) => {
        const fallbackStart = tasks.length ? row.index / tasks.length : 0
        const fallbackEnd = tasks.length ? (row.index + 1) / tasks.length : 1
        const startRatio = row.startDate
          ? (row.startDate.getTime() - minTime) / timeSpan
          : fallbackStart
        const endRatio = row.endDate
          ? (row.endDate.getTime() - minTime) / timeSpan
          : fallbackEnd
        const left = Math.max(0, Math.min(startRatio, endRatio) * 100)
        const width = Math.max(8, Math.min(100 - left, Math.abs(endRatio - startRatio) * 100))

        return {
          task: row.task,
          left,
          width,
          accent: activityAccent(row.task.type),
        }
      }),
    }
  }, [tasks])

  return (
    <div className="rounded-md bg-white/70 p-3 ring-1 ring-black/5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-xs font-semibold text-zinc-900">Management plan timeline</div>
        <div className="text-[11px] text-zinc-600">{timelineRows.rangeLabel}</div>
      </div>

      <div className="mt-4 space-y-3">
        {timelineRows.rows.length ? (
          timelineRows.rows.map(({ task, left, width, accent }) => (
            <div key={task.id} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-zinc-900">{task.name || "Untitled activity"}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {taskTypeLabel(task.type)} · {taskTiming(task)}
                </div>
              </div>
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
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500">
            No activities available for this report.
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
  const tasks = plan?.expand?.tasks ?? []

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
    })
  }, [
    fetchSimulationResultByRecordId,
    result,
    simulation?.resultJson,
    simulationId,
    simulationResultLoading,
  ])

  const resultRows = useMemo(() => simulationResultRows(result), [result])
  const speciesSummaries = useMemo(() => summarizeSpecies(result), [result])

  function handleExportPdf() {
    if (!simulation || !result) {
      setExportError("Load a completed simulation result before exporting.")
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
    <section className="simulation-report-page absolute inset-x-0 bottom-0 top-[4.5rem] z-30 overflow-auto bg-[#f5f5f2] p-pane">
      <div className="simulation-report-document mx-auto max-w-5xl rounded-pane bg-white p-6 shadow-sm ring-1 ring-zinc-200 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate(tileId && simulationId ? `/tile/${tileId}/simulation/${simulationId}` : "/simulations")}
              className="report-print-hidden text-sm font-medium text-zinc-500 hover:text-zinc-950"
            >
              Back to results
            </button>
            <h1 className="mt-4 text-3xl font-medium text-zinc-950">Simulation report</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {tile?.name || "Unknown tile"} · {plan?.name || "Unknown plan"}
            </p>
          </div>
          <Button
            type="button"
            disabled={exporting || !result}
            onClick={handleExportPdf}
            className="report-print-hidden rounded-lg bg-zinc-900 px-4 text-white hover:bg-zinc-800"
          >
            {exporting ? "Exporting..." : "Export PDF"}
          </Button>
        </div>

        {simulationResultError ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load result: {simulationResultError.message}
          </div>
        ) : null}

        {exportError ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {exportError}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Simulation", simulation?.id ?? "Loading..."],
            ["Status", simulationStatus(simulation)],
            ["Tile area", formatArea(tileAreaKm2(tile)) ?? "Unknown"],
            ["Created", formatDate(simulation?.created)],
          ].map(([label, value]) => (
            <div key={label} className="report-no-break rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
              <div className="mt-2 break-words text-sm font-medium text-zinc-900">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Management plan</h2>
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
                  No activities available for this report.
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Results</h2>
            <div className="mt-4">
              {result ? (
                <BiomassChart result={result} height={300} />
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                  {simulationResultLoading ? "Loading simulation result..." : "No completed result is available."}
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
                <h3 className="text-sm font-semibold text-zinc-950">Species summaries</h3>
                <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
                        <th className="px-3 py-2 font-medium">Species</th>
                        <th className="px-3 py-2 font-medium">Initial</th>
                        <th className="px-3 py-2 font-medium">Final</th>
                        <th className="px-3 py-2 font-medium">Change</th>
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
                  Final result snapshot: step {result?.steps?.at(-1) ?? "unknown"}.
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="report-print-break mt-8">
          <h2 className="text-lg font-semibold text-zinc-950">Biomass and management timeline</h2>
          <div className="report-no-break mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            {result ? (
              <BiomassChart result={result} height={260} />
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                {simulationResultLoading ? "Loading simulation result..." : "No completed result is available."}
              </div>
            )}
            <div className="mt-4">
              <ManagementPlanTimeline tasks={tasks} />
            </div>
          </div>
        </div>

        <div className="report-print-break mt-8">
          <h2 className="text-lg font-semibold text-zinc-950">Normalized input</h2>
          <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
            {JSON.stringify(simulation?.inputJson ?? simulation?.options ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </section>
  )
}
