import { useNavigate, useParams } from "react-router-dom"
import { cn } from "@/lib/utils"
import { useAtomValue } from "jotai"
import { simulationsAtom, managementPlansAtom } from "@/state/ecotwin-atoms"
import { useEffect, useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, NoteIcon } from "@hugeicons/core-free-icons"

type SimulationListProps = {
  className?: string
}

export function SimulationList({ className }: SimulationListProps) {
  const navigate = useNavigate()
  const { tileId, simulationId, planId } = useParams<{ tileId: string; simulationId?: string; planId?: string }>()
  const simulations = useAtomValue(simulationsAtom)
  const managementPlans = useAtomValue(managementPlansAtom)
  
  const [activeTab, setActiveTab] = useState<"simulations" | "plans">(
    simulationId ? "simulations" : "plans"
  )

  useEffect(() => {
    setActiveTab(simulationId ? "simulations" : "plans")
  }, [simulationId])

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

  const filteredSimulations = useMemo(() => {
    return (simulations ?? []).filter((sim) => {
      const simPlanId = sim.expand?.plan?.id ?? sim.plan
      return !!simPlanId && filteredPlanIds.has(simPlanId)
    })
  }, [filteredPlanIds, simulations])

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex shrink-0 border-b border-black/5 bg-white/40 px-2 pt-2 backdrop-blur-sm">
        <button
          onClick={() => setActiveTab("simulations")}
          className={cn(
            "flex-1 cursor-pointer border-b-2 py-3 text-center text-sm font-bold transition-colors",
            activeTab === "simulations" 
              ? "border-[#3f5a50] text-zinc-900" 
              : "border-transparent text-zinc-500 hover:text-zinc-700"
          )}
        >
          Simulations
        </button>
        <button
          onClick={() => setActiveTab("plans")}
          className={cn(
            "flex-1 cursor-pointer border-b-2 py-3 text-center text-sm font-bold transition-colors",
            activeTab === "plans" 
              ? "border-[#3f5a50] text-zinc-900" 
              : "border-transparent text-zinc-500 hover:text-zinc-700"
          )}
        >
          Plans
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 [scrollbar-gutter:stable]">
        {activeTab === "simulations" ? (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Simulation Runs</h2>
            {!filteredSimulations.length && (
              <div className="text-xs text-zinc-500 italic py-4">No simulations found for this tile.</div>
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
                        {sim.simulationId || "Untitled Run"}
                      </div>
                      <div className={cn(
                        "truncate text-[10px]",
                        isActive ? "text-white/70" : "text-zinc-600"
                      )}>
                        {sim.expand?.plan?.name || "Unassigned plan"}
                      </div>
                      <div className={cn(
                        "text-[10px]",
                        isActive ? "text-white/60" : "text-zinc-500"
                      )}>
                        {sim.created?.substring(0, 10)}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Management Plans</h2>
            {!filteredPlans.length && (
              <div className="text-xs text-zinc-500 italic py-4">No management plans found for this tile.</div>
            )}
            {filteredPlans.map((plan) => {
              const isActive = planId === plan.id
              return (
                <div
                  key={plan.id}
                  onClick={() => navigate(`/tile/${tileId}/management-plan/${plan.id}`)}
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
                      <HugeiconsIcon icon={NoteIcon} size={16} className={isActive ? "text-white" : "text-zinc-600"} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold uppercase tracking-tight">
                        {plan.name || "Untitled Plan"}
                      </div>
                      <div className={cn(
                        "text-[10px]",
                        isActive ? "text-white/60" : "text-zinc-500"
                      )}>
                        {plan.created?.substring(0, 10)}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
