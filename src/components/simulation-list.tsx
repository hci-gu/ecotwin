import { useNavigate, useParams } from "react-router-dom"
import { cn } from "@/lib/utils"
import { useAtomValue } from "jotai"
import { simulationsAtom, managementPlansAtom } from "@/state/ecotwin-atoms"
import { useMemo } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon } from "@hugeicons/core-free-icons"

type SimulationListProps = {
  className?: string
}

export function SimulationList({ className }: SimulationListProps) {
  const navigate = useNavigate()
  const { tileId, simulationId, planId } = useParams<{ tileId: string; simulationId?: string; planId?: string }>()
  const simulations = useAtomValue(simulationsAtom)
  const managementPlans = useAtomValue(managementPlansAtom)

  const filteredPlans = useMemo(() => {
    if (!tileId) return managementPlans ?? []
    return (managementPlans ?? []).filter(
      (plan) => plan.tile === tileId || plan.expand?.tile?.id === tileId
    )
  }, [managementPlans, tileId])

  const filteredPlanIds = useMemo(
    () => new Set(filteredPlans.map((plan) => plan.id)),
    [filteredPlans]
  )

  const activeSimulation = useMemo(() => {
    if (!simulationId) return null
    return simulations?.find((sim) => sim.id === simulationId) ?? null
  }, [simulationId, simulations])

  const activePlanId = planId ?? activeSimulation?.expand?.plan?.id ?? activeSimulation?.plan ?? null
  const activePlan = useMemo(() => {
    if (!activePlanId) return null
    return (
      filteredPlans.find((plan) => plan.id === activePlanId) ??
      activeSimulation?.expand?.plan ??
      null
    )
  }, [activePlanId, activeSimulation?.expand?.plan, filteredPlans])

  const filteredSimulations = useMemo(() => {
    if (!activePlanId) {
      return simulationId
        ? (simulations ?? []).filter((sim) => sim.id === simulationId)
        : []
    }

    return (simulations ?? []).filter((sim) => {
      const simPlanId = sim.expand?.plan?.id ?? sim.plan
      return simPlanId === activePlanId && filteredPlanIds.has(activePlanId)
    })
  }, [activePlanId, filteredPlanIds, simulationId, simulations])

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="shrink-0 border-b border-black/5 bg-white/40 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-950">Simulations</h2>
            <div className="mt-0.5 truncate text-[11px] text-zinc-500">
              {activePlan?.name || "No plan selected"}
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-medium text-zinc-500">
            {filteredSimulations.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 [scrollbar-gutter:stable]">
        <div className="space-y-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            Simulation runs
          </div>
          {!filteredSimulations.length && (
            <div className="py-4 text-xs italic text-zinc-500">
              {activePlanId ? "No simulations found for this plan." : "No plan selected."}
            </div>
          )}
          {filteredSimulations.map((sim) => {
            const isActive = simulationId === sim.id
            return (
              <div
                key={sim.id}
                onClick={() => navigate(`/tile/${tileId}/simulation/${sim.id}`)}
                className={cn(
                  "group cursor-pointer rounded-md border p-3 transition-all",
                  isActive
                    ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
                    : "border-black/5 bg-white/50 hover:border-black/20 hover:bg-white/80"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    isActive ? "bg-white/20" : "bg-zinc-100"
                  )}>
                    <HugeiconsIcon icon={PlayIcon} size={16} className={isActive ? "text-white" : "text-zinc-600"} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold uppercase tracking-tight">
                      {sim.simulationId || sim.id}
                    </div>
                    <div className={cn(
                      "truncate text-[10px]",
                      isActive ? "text-white/70" : "text-zinc-600"
                    )}>
                      {sim.status ?? (sim.resultJson || sim.resultNpz ? "completed" : "pending")}
                    </div>
                    <div className={cn(
                      "text-[10px]",
                      isActive ? "text-white/60" : "text-zinc-500"
                    )}>
                      {sim.created?.substring(0, 10) || "Unknown date"}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
