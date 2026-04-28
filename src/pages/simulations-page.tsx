import { Button } from "@/components/ui/button"
import {
  deleteSimulation,
} from "@/state/ecotwin-api"
import {
  fetchSimulationResultByRecordIdAtom,
  refreshSimulationsAtom,
  simulationsAtom,
  simulationsErrorAtom,
  simulationsLoadingAtom,
} from "@/state/ecotwin-atoms"
import type { Simulation } from "@/state/ecotwin-types"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

type SimulationRow = {
  simulation: Simulation
  tileId?: string
  tileName: string
  planName: string
  createdDate: string
  status: string
  resultLabel: string
}

function simulationStatus(simulation: Simulation) {
  if (simulation.status) return simulation.status
  if (simulation.resultJson || simulation.resultNpz) return "completed"
  if (simulation.simulationId) return "not-run"
  return "pending"
}

function toSimulationRow(simulation: Simulation): SimulationRow {
  const plan = simulation.expand?.plan
  const tile = plan?.expand?.tile
  const hasResult = Boolean(simulation.resultJson || simulation.resultNpz)

  return {
    simulation,
    tileId: tile?.id ?? plan?.tile,
    tileName: tile?.name?.trim() || "Unknown tile",
    planName: plan?.name?.trim() || "Unknown plan",
    createdDate: simulation.created?.substring(0, 10) || "Unknown date",
    status: simulationStatus(simulation),
    resultLabel: hasResult ? "Result cached" : "No result",
  }
}

export function SimulationsPage() {
  const navigate = useNavigate()
  const simulations = useAtomValue(simulationsAtom)
  const loading = useAtomValue(simulationsLoadingAtom)
  const error = useAtomValue(simulationsErrorAtom)
  const refreshSimulations = useSetAtom(refreshSimulationsAtom)
  const fetchSimulationResultByRecordId = useSetAtom(fetchSimulationResultByRecordIdAtom)
  const [rerunningId, setRerunningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (simulations !== null || loading || error) return
    void refreshSimulations()
  }, [error, loading, refreshSimulations, simulations])

  const rows = useMemo(
    () => (simulations ?? []).map(toSimulationRow),
    [simulations]
  )

  async function handleRerun(simulation: Simulation) {
    if (simulation.resultJson || simulation.resultNpz) {
      const confirmed = window.confirm(
        "Rerunning this simulation will replace cached outputs for the record. Continue?"
      )
      if (!confirmed) return
    }

    setRerunningId(simulation.id)
    setRunError(null)
    try {
      const result = await fetchSimulationResultByRecordId({
        simulationRecordId: simulation.id,
        forceRun: true,
      })
      if (!result) throw new Error("Simulation run did not return a result.")
      await refreshSimulations()
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setRerunningId(null)
    }
  }

  async function handleDeleteSimulation(simulation: Simulation) {
    const confirmed = window.confirm(
      "Delete this simulation and its cached result files? This cannot be undone."
    )
    if (!confirmed) return

    setDeletingId(simulation.id)
    setDeleteError(null)
    try {
      await deleteSimulation(simulation.id)
      await refreshSimulations()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="absolute inset-x-0 bottom-0 top-[4.5rem] z-30 p-pane">
      <div className="h-full w-full overflow-hidden rounded-pane bg-[#f5f5f2] p-6 sm:p-8">
        <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[2rem] font-medium text-zinc-950">Simulations</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Browse simulation runs and open completed results on their tile route.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void refreshSimulations()}
              className="mt-1 rounded-lg bg-white px-3 text-sm text-zinc-700 shadow-sm"
            >
              {loading ? "Loading..." : "Reload"}
            </Button>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Failed to load simulations: {error.message}
            </div>
          ) : null}

          {runError ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Failed to run simulation: {runError}
            </div>
          ) : null}

          {deleteError ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Failed to delete simulation: {deleteError}
            </div>
          ) : null}

          <div className="mt-8 min-h-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="h-full overflow-auto">
              <table className="min-w-full table-fixed">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-zinc-200 bg-white text-left text-sm text-zinc-800">
                    <th className="px-4 py-3 font-medium">Simulation</th>
                    <th className="px-4 py-3 font-medium">Runner id</th>
                    <th className="px-4 py-3 font-medium">Tile</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row) => {
                      const canOpen = Boolean(row.tileId)
                      return (
                        <tr key={row.simulation.id} className="border-b border-zinc-200 last:border-b-0">
                          <td className="px-4 py-5 align-top text-sm font-medium text-zinc-900">
                            <span className="block max-w-[12rem] truncate">{row.simulation.id}</span>
                          </td>
                          <td className="px-4 py-5 align-top text-sm text-zinc-600">
                            <span className="block max-w-[12rem] truncate">
                              {row.simulation.simulationId ?? "Not uploaded"}
                            </span>
                          </td>
                          <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.tileName}</td>
                          <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.planName}</td>
                          <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.createdDate}</td>
                          <td className="px-4 py-5 align-top text-sm text-zinc-600 capitalize">{row.status}</td>
                          <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.resultLabel}</td>
                          <td className="px-4 py-5 align-top text-sm">
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                disabled={!canOpen}
                                onClick={() =>
                                  row.tileId
                                    ? navigate(`/tile/${row.tileId}/simulation/${row.simulation.id}`)
                                    : undefined
                                }
                                className="text-zinc-700 transition-colors hover:text-zinc-950 disabled:text-zinc-300"
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                disabled={rerunningId === row.simulation.id}
                                onClick={() => void handleRerun(row.simulation)}
                                className="text-zinc-700 transition-colors hover:text-zinc-950 disabled:text-zinc-300"
                              >
                                {rerunningId === row.simulation.id ? "Running..." : "Rerun"}
                              </button>
                              <button
                                type="button"
                                disabled={!canOpen || !(row.simulation.resultJson || row.simulation.resultNpz)}
                                onClick={() =>
                                  row.tileId
                                    ? navigate(`/tile/${row.tileId}/simulation/${row.simulation.id}/report`)
                                    : undefined
                                }
                                className="text-zinc-700 transition-colors hover:text-zinc-950 disabled:text-zinc-300"
                              >
                                Report
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === row.simulation.id}
                                onClick={() => void handleDeleteSimulation(row.simulation)}
                                className="text-red-600 transition-colors hover:text-red-700 disabled:text-red-300"
                              >
                                {deletingId === row.simulation.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-zinc-500">
                        {loading ? "Loading simulations..." : "No simulations found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
