import { HugeiconsIcon } from "@hugeicons/react"
import { 
  PlayIcon, 
  PencilEdit02Icon, 
  LeftToRightListDashIcon, 
  Download02Icon, 
  ArrowDown01Icon 
} from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

type ActionsPaneProps = {
  className?: string
}

export function ActionsPane({ className }: ActionsPaneProps) {
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
        {/* Main Action */}
        <button className="flex items-center justify-center w-full gap-2 px-4 py-2 text-sm font-medium text-white transition-opacity bg-zinc-800 rounded-md hover:opacity-90 active:scale-95 cursor-pointer">
          <HugeiconsIcon icon={PlayIcon} size={16} />
          Run simulation
        </button>

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
