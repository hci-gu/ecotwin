import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { 
  ArrowDown01Icon, 
  ArrowUp01Icon,
  CodeIcon,
  Tick01Icon
} from "@hugeicons/core-free-icons"
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

type FunctionalGroupItemProps = {
  name: string
  value: string
  color: string
  checked?: boolean
}

function FunctionalGroupItem({ name, value, color, checked = true }: FunctionalGroupItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white/50 p-3 shadow-sm transition-colors hover:bg-white/80">
      <div className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
        checked ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-transparent"
      )}>
        {checked && <HugeiconsIcon icon={Tick01Icon} size={12} />}
      </div>
      <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="flex flex-1 flex-col truncate">
        <span className="text-xs font-medium text-zinc-900">{name}</span>
        <span className="text-[10px] text-zinc-500">{value}</span>
      </div>
      <button className="text-[10px] font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer">
        Toggle visibility
      </button>
    </div>
  )
}

type TileDetailsProps = {
  name: string
  status?: string
  createdDate?: string
  landcoverContent?: React.ReactNode
  oceanDataContent?: React.ReactNode
}

export function TileDetails({ name, status = "Ready to run", createdDate = "2025-12-12", landcoverContent, oceanDataContent }: TileDetailsProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header Section */}
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-zinc-900 uppercase tracking-tight">{name}</h2>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
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
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-zinc-800 py-2 text-xs font-medium text-white hover:bg-zinc-700 cursor-pointer">
              Management plan
              <HugeiconsIcon icon={CodeIcon} size={14} />
            </button>
          </div>
        </Accordion>

        <Accordion title="Functional groups">
          <div className="space-y-2">
            <FunctionalGroupItem name="Plankton" value="30,540 t" color="#fbbf24" />
            <FunctionalGroupItem name="Sprat" value="30,540 t" color="#10b981" />
            <FunctionalGroupItem name="Herring" value="30,540 t" color="#0ea5e9" />
            <FunctionalGroupItem name="Cod" value="30,540 t" color="#f43f5e" />
            
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button className="rounded-md bg-zinc-800 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 cursor-pointer">Select all</button>
              <button className="rounded-md bg-zinc-800 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 cursor-pointer">None</button>
              <button className="rounded-md bg-zinc-800 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 cursor-pointer">Hide</button>
            </div>
          </div>
        </Accordion>

        <Accordion title="Display mode">
          <div className="space-y-4">
            <div className="flex gap-2">
              <button className="flex-1 rounded-md bg-zinc-800 py-2 text-xs font-medium text-white hover:bg-zinc-700 cursor-pointer">Heatmap</button>
              <button className="flex-1 rounded-md bg-zinc-700 py-2 text-xs font-medium text-white cursor-pointer">Video</button>
              <button className="flex-1 rounded-md bg-zinc-700 py-2 text-xs font-medium text-white cursor-pointer">Graph</button>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-900">Layers</h3>
              <div className="grid grid-cols-2 gap-y-3">
                {[
                  { label: "Biomass", checked: true },
                  { label: "Temperature", checked: false },
                  { label: "Salinity", checked: false },
                  { label: "Accessibility", checked: false },
                ].map((layer) => (
                  <label key={layer.label} className="flex items-center gap-2 cursor-pointer group">
                    <div className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      layer.checked ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 group-hover:border-zinc-400"
                    )}>
                      {layer.checked && <HugeiconsIcon icon={Tick01Icon} size={10} />}
                    </div>
                    <span className="text-[11px] font-medium text-zinc-700 group-hover:text-zinc-900 transition-colors uppercase">{layer.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Accordion>

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
