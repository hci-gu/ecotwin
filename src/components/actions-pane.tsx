import { HugeiconsIcon } from "@hugeicons/react"
import { 
  PlayIcon, 
  PencilEdit02Icon, 
  LeftToRightListDashIcon, 
  Download02Icon, 
  ArrowDown01Icon 
} from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import type { ManagementPlan } from "@/state/ecotwin-types"

type ActionsPaneProps = {
  className?: string
  activePlan?: ManagementPlan | null
  canRunSimulation?: boolean
  isRunningSimulation?: boolean
  runError?: string | null
  onRunSimulation?: () => void
}

export function ActionsPane({
  className,
  activePlan,
  canRunSimulation = false,
  isRunningSimulation = false,
  runError,
  onRunSimulation,
}: ActionsPaneProps) {
  return (
    <div className={cn(
      "flex flex-col overflow-hidden border border-white/40 bg-white/80 shadow-2xl backdrop-blur-md rounded-pane",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
        <span className="text-sm font-semibold text-zinc-900">Actions</span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={18} className="text-zinc-500" />
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {activePlan ? (
          <>
            <div className="rounded-md border border-black/5 bg-white/70 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Active plan
              </div>
              <div className="mt-1 text-sm font-medium text-zinc-900">
                {activePlan.name || "Untitled plan"}
              </div>
            </div>

            <button
              type="button"
              onClick={onRunSimulation}
              disabled={!canRunSimulation || isRunningSimulation}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HugeiconsIcon icon={PlayIcon} size={16} />
              {isRunningSimulation ? "Running simulation..." : "Run simulation"}
            </button>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-black/10 bg-white/60 px-3 py-3 text-xs text-zinc-600">
            Select a management plan for this tile to run a simulation.
          </div>
        )}

        {runError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            {runError}
          </div>
        ) : null}

        {/* Secondary Actions */}
        <div className="grid grid-cols-3 gap-2">
          <button className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-200/50 border border-zinc-300/50 rounded-md hover:bg-zinc-200/80 transition-colors active:scale-95 cursor-pointer">
            <HugeiconsIcon icon={PencilEdit02Icon} size={14} />
            Edit
          </button>
          <button className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-200/50 border border-zinc-300/50 rounded-md hover:bg-zinc-200/80 transition-colors active:scale-95 cursor-pointer">
            <HugeiconsIcon icon={LeftToRightListDashIcon} size={14} />
            Results
          </button>
          <button className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-200/50 border border-zinc-300/50 rounded-md hover:bg-zinc-200/80 transition-colors active:scale-95 cursor-pointer">
            <HugeiconsIcon icon={Download02Icon} size={14} />
            Export
          </button>
        </div>
      </div>
    </div>
  )
}
