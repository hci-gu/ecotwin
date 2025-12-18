import { LeftPane } from "@/components/left-pane"
import {
  managementPlansAtom,
  managementPlansErrorAtom,
  managementPlansLoadingAtom,
  refreshManagementPlansAtom,
} from "@/state/ecotwin-atoms"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"

export function ManagementPlansPage() {
  const plans = useAtomValue(managementPlansAtom)
  const loading = useAtomValue(managementPlansLoadingAtom)
  const error = useAtomValue(managementPlansErrorAtom)
  const refreshPlans = useSetAtom(refreshManagementPlansAtom)

  useEffect(() => {
    if (plans !== null || loading || error) return
    void refreshPlans()
  }, [error, loading, plans, refreshPlans])

  return (
    <LeftPane>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold text-zinc-900">
          Management plans
        </h1>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refreshPlans()}
          className="inline-flex cursor-pointer items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading…" : "Reload"}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
          Failed to load management plans: {error.message}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {plans?.length ? (
          plans.map((plan) => {
            const taskCount =
              plan.expand?.tasks?.length ??
              (Array.isArray(plan.tasks) ? plan.tasks.length : 0)
            return (
              <div
                key={plan.id}
                className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-black/5"
              >
                <div className="truncate text-xs font-medium text-zinc-900">
                  {plan.name || "Untitled plan"}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-zinc-700">
                  {plan.id}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-700">
                  tasks: {taskCount}
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-xs text-zinc-700">
            {loading ? "Loading plans…" : "No management plans found."}
          </div>
        )}
      </div>
    </LeftPane>
  )
}
