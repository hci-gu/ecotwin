import { HugeiconsIcon } from "@hugeicons/react"
import { 
  PlayIcon, 
  PencilEdit02Icon, 
  LeftToRightListDashIcon, 
  Download02Icon, 
  ArrowDown01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import type { ManagementPlan } from "@/state/ecotwin-types"

type ActionsPaneProps = {
  className?: string
  activePlan?: ManagementPlan | null
  canRunSimulation?: boolean
  isRunningSimulation?: boolean
  runError?: string | null
  runDisabledReason?: string | null
  onRunSimulation?: () => void
  onEdit?: () => void
  onShowResults?: () => void
  onExport?: () => void
  onDelete?: () => void
  canShowResults?: boolean
  canExport?: boolean
  resultsMessage?: string | null
}

export function ActionsPane({
  className,
  activePlan,
  canRunSimulation = false,
  isRunningSimulation = false,
  runError,
  runDisabledReason,
  onRunSimulation,
  onEdit,
  onShowResults,
  onExport,
  onDelete,
  canShowResults = false,
  canExport = false,
  resultsMessage,
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
              title={!canRunSimulation && runDisabledReason ? runDisabledReason : undefined}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HugeiconsIcon icon={PlayIcon} size={16} />
              {isRunningSimulation ? "Running simulation..." : "Run simulation"}
            </button>

            {!canRunSimulation && runDisabledReason ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {runDisabledReason}
              </div>
            ) : null}
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

        {resultsMessage ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            {resultsMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={!onEdit}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-zinc-300/50 bg-zinc-200/50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HugeiconsIcon icon={PencilEdit02Icon} size={14} />
            Edit
          </button>
          <button
            type="button"
            onClick={onShowResults}
            disabled={!canShowResults || !onShowResults}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-zinc-300/50 bg-zinc-200/50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HugeiconsIcon icon={LeftToRightListDashIcon} size={14} />
            Results
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!canExport || !onExport}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-zinc-300/50 bg-zinc-200/50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HugeiconsIcon icon={Download02Icon} size={14} />
            Export
          </button>
        </div>

        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 active:scale-95"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} />
            Delete tile
          </button>
        ) : null}
      </div>
    </div>
  )
}
