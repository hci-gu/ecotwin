import { LeftPane } from "@/components/left-pane"
import {
  refreshSimulationsAtom,
  simulationsAtom,
  simulationsErrorAtom,
  simulationsLoadingAtom,
} from "@/state/ecotwin-atoms"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"

export function SimulationsPage() {
  const simulations = useAtomValue(simulationsAtom)
  const loading = useAtomValue(simulationsLoadingAtom)
  const error = useAtomValue(simulationsErrorAtom)
  const refreshSimulations = useSetAtom(refreshSimulationsAtom)

  useEffect(() => {
    if (simulations !== null || loading || error) return
    void refreshSimulations()
  }, [error, loading, refreshSimulations, simulations])

  return (
    <LeftPane>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold text-zinc-900">Simulations</h1>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refreshSimulations()}
          className="inline-flex cursor-pointer items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading…" : "Reload"}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
          Failed to load simulations: {error.message}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {simulations?.length ? (
          simulations.map((sim) => (
            <div
              key={sim.id}
              className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-black/5"
            >
              <div className="truncate text-xs font-medium text-zinc-900">
                {sim.id}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-zinc-700">
                Plan: {sim.expand?.plan?.name ?? (sim.plan ? sim.plan : "—")}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-zinc-700">
                simulationId: {sim.simulationId ?? "—"}
              </div>
            </div>
          ))
        ) : (
          <div className="text-xs text-zinc-700">
            {loading ? "Loading simulations…" : "No simulations found."}
          </div>
        )}
      </div>
    </LeftPane>
  )
}
