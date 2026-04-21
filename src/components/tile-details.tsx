import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { 
  ArrowDown01Icon, 
  ArrowUp01Icon
} from "@hugeicons/core-free-icons"
import type { TileStatusTone } from "@/lib/tile-population"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

type AccordionProps = {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function Accordion({ title, children, defaultOpen = true }: AccordionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)
  return (
    <div className="py-2">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-2 text-sm font-semibold text-zinc-900 cursor-pointer"
      >
        <span>{title}</span>
        <HugeiconsIcon icon={isOpen ? ArrowUp01Icon : ArrowDown01Icon} size={18} className="text-zinc-500" />
      </button>
      {isOpen && <div className="mt-2 space-y-4">{children}</div>}
    </div>
  )
}

type TileDetailsProps = {
  name: string
  status?: string
  statusTone?: TileStatusTone
  createdDate?: string
  managementPlansContent?: React.ReactNode
  landcoverContent?: React.ReactNode
  oceanDataContent?: React.ReactNode
}

export function TileDetails({
  name,
  status = "Ready to run",
  statusTone = "success",
  createdDate = "2025-12-12",
  managementPlansContent,
  landcoverContent,
  oceanDataContent,
}: TileDetailsProps) {
  const statusDotClassName =
    statusTone === "danger"
      ? "bg-rose-500"
      : statusTone === "warning"
        ? "bg-amber-500"
        : statusTone === "neutral"
          ? "bg-zinc-400"
          : "bg-emerald-500"

  return (
    <div className="flex flex-col gap-4">
      {/* Header Section */}
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-zinc-900 uppercase tracking-tight">{name}</h2>
        <div className="flex items-center gap-2">
          <div className={cn("h-2.5 w-2.5 rounded-full", statusDotClassName)} />
          <span className="text-xs font-medium text-zinc-700">{status}</span>
        </div>
        <div className="text-[11px] text-zinc-500">
          Created: {createdDate}
        </div>
      </div>

      <Separator className="bg-black/5" />

      {/* Accordions */}
      <div className="divide-y divide-black/5">
        <Accordion title="Simulation info">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Area</span>
              <span className="font-medium text-zinc-900">128km²</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Grid</span>
              <span className="font-medium text-zinc-900">40x32</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Time step</span>
              <span className="font-medium text-zinc-900">6 min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Duration</span>
              <span className="font-medium text-zinc-900">Jan-Dec 2025</span>
            </div>
          </div>
        </Accordion>

        {managementPlansContent && (
          <Accordion title="Management plans" defaultOpen={false}>
            <div className="pb-4">
              {managementPlansContent}
            </div>
          </Accordion>
        )}

        {landcoverContent && (
          <Accordion title="Landcover" defaultOpen={false}>
            <div className="pb-4">
              {landcoverContent}
            </div>
          </Accordion>
        )}

        {oceanDataContent && (
          <Accordion title="Ocean data" defaultOpen={false}>
            <div className="pb-4">
              {oceanDataContent}
            </div>
          </Accordion>
        )}
      </div>
    </div>
  )
}
