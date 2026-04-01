import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  managementPlansAtom,
  managementPlansErrorAtom,
  managementPlansLoadingAtom,
  refreshManagementPlansAtom,
} from "@/state/ecotwin-atoms"
import { cn } from "@/lib/utils"
import type { Task } from "@/state/ecotwin-types"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useState } from "react"

type PlanRow = {
  id: string
  name: string
  typeLabel: string
  typeClassName: string
  startDate: string
  endDate: string
  costLabel: string
  revenueLabel: string
  statusLabel: string
}

const typeStyles: Record<string, string> = {
  landcover: "bg-amber-100 text-amber-900",
  fishingPolicy: "bg-sky-100 text-sky-900",
  activity: "bg-zinc-100 text-zinc-700",
}

function formatDate(value?: string) {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toISOString().slice(0, 10)
}

function formatCurrency(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("sv-SE").format(value)
}

function pickTaskDates(tasks: Task[]) {
  const starts = tasks
    .map((task) => task.start)
    .filter((value): value is string => Boolean(value))
    .sort()
  const ends = tasks
    .map((task) => task.end)
    .filter((value): value is string => Boolean(value))
    .sort()

  return {
    startDate: formatDate(starts[0]),
    endDate: formatDate(ends.at(-1)),
  }
}

function getTaskMetadata(task?: Task) {
  const data =
    task?.data && typeof task.data === "object" && !Array.isArray(task.data)
      ? (task.data as Record<string, unknown>)
      : undefined

  return {
    cost: data?.cost,
    revenue: data?.revenue,
    status: data?.status,
  }
}

function toPlanRow(plan: {
  id: string
  name?: string
  created?: string
  expand?: { tasks?: Task[] }
  tasks?: string[]
}) {
  const tasks = plan.expand?.tasks ?? []
  const primaryTask = tasks[0]
  const { startDate, endDate } = tasks.length
    ? pickTaskDates(tasks)
    : {
        startDate: formatDate(plan.created),
        endDate: "—",
      }
  const metadata = getTaskMetadata(primaryTask)
  const taskType = primaryTask?.type ?? "activity"

  return {
    id: plan.id,
    name: plan.name?.trim() || "Untitled plan",
    typeLabel: primaryTask?.type ?? "Activity",
    typeClassName: typeStyles[taskType] ?? typeStyles.activity,
    startDate,
    endDate,
    costLabel: formatCurrency(metadata.cost),
    revenueLabel: formatCurrency(metadata.revenue),
    statusLabel:
      typeof metadata.status === "string" && metadata.status.trim()
        ? metadata.status
        : tasks.length
          ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}`
          : "Planned",
  } satisfies PlanRow
}

export function ManagementPlansPage() {
  const plans = useAtomValue(managementPlansAtom)
  const loading = useAtomValue(managementPlansLoadingAtom)
  const error = useAtomValue(managementPlansErrorAtom)
  const refreshPlans = useSetAtom(refreshManagementPlansAtom)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1)

  useEffect(() => {
    if (plans !== null || loading || error) return
    void refreshPlans()
  }, [error, loading, plans, refreshPlans])

  const rows = plans?.map(toPlanRow) ?? []
  const isMapSelectionStep = createModalOpen && createStep === 2

  function handleCreateModalOpenChange(nextOpen: boolean) {
    setCreateModalOpen(nextOpen)
    if (!nextOpen) setCreateStep(1)
  }

  return (
    <section
      className={cn(
        "absolute inset-x-0 bottom-0 top-[4.5rem] z-30 p-pane",
        isMapSelectionStep && "pointer-events-none"
      )}
    >
      <div
        className={cn(
          "h-full w-full rounded-pane transition-all duration-300",
          isMapSelectionStep ? "bg-transparent p-0" : "bg-[#f5f5f2] p-6 sm:p-8"
        )}
      >
        <div
          className={cn(
            "flex flex-col transition-all duration-300",
            isMapSelectionStep
              ? "ml-auto h-full w-full overflow-auto rounded-pane bg-[#f5f5f2] p-6 pointer-events-auto sm:w-[calc(50%-0.5rem)] sm:p-8"
              : "mx-auto w-full max-w-7xl"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[2rem] font-medium tracking-[-0.02em] text-zinc-950">
                All activites
              </h1>
              <p className="mt-1 text-sm text-zinc-500">Text</p>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void refreshPlans()}
              className="mt-1 rounded-lg bg-white px-3 text-sm text-zinc-700 shadow-sm"
            >
              {loading ? "Loading..." : "Reload"}
            </Button>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Failed to load management plans: {error.message}
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed">
                <thead>
                  <tr className="border-b border-zinc-200 bg-white text-left text-sm text-zinc-800">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Start date</th>
                    <th className="px-4 py-3 font-medium">End Date</th>
                    <th className="px-4 py-3 font-medium">Cost (SEK)</th>
                    <th className="px-4 py-3 font-medium">Revenue (SEK)</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-200 last:border-b-0">
                        <td className="px-4 py-5 align-top text-sm leading-5 text-zinc-700">
                          <span className="block max-w-[11rem] whitespace-normal">
                            {row.name}
                          </span>
                        </td>
                        <td className="px-4 py-5 align-top">
                          <Badge
                            className={`rounded-full border-0 text-[0.6875rem] font-medium ${row.typeClassName}`}
                          >
                            {row.typeLabel}
                          </Badge>
                        </td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">
                          {row.startDate}
                        </td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">
                          {row.endDate}
                        </td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">
                          {row.costLabel}
                        </td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">
                          {row.revenueLabel}
                        </td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">
                          {row.statusLabel}
                        </td>
                        <td className="px-4 py-5 align-top text-sm">
                          <button
                            type="button"
                            className="text-zinc-600 transition-colors hover:text-zinc-950"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-sm text-zinc-500"
                      >
                        {loading ? "Loading plans..." : "No management plans found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => {
                setCreateStep(1)
                setCreateModalOpen(true)
              }}
              className="h-9 rounded-lg bg-black px-4 text-sm font-medium text-white hover:bg-black/90"
            >
              Create New +
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-zinc-300 bg-transparent px-4 text-sm font-medium text-zinc-700 hover:bg-white"
            >
              Import CSV/agist
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog
        open={createModalOpen && createStep === 1}
        onOpenChange={handleCreateModalOpenChange}
      >
        <AlertDialogContent
          size="lg"
          overlayClassName="bg-black/55"
          className="top-1/2 left-1/2 gap-0 rounded-2xl border border-zinc-200 p-0 -translate-x-1/2 -translate-y-1/2"
        >
          <div className="p-7 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[1.05rem] text-zinc-500">New management plan</p>
                <AlertDialogTitle className="mt-2 text-[2.1rem] font-medium leading-none text-zinc-950">
                  Create new activity
                </AlertDialogTitle>
              </div>

              <button
                type="button"
                onClick={() => handleCreateModalOpenChange(false)}
                className="inline-flex size-10 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-100"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={1.8} />
              </button>
            </div>

            <div className="mt-10">
              <div className="h-1 w-full rounded-full bg-zinc-200">
                <div className="h-full w-1/3 rounded-full bg-[#4f7865]" />
              </div>

              <div className="mt-5 grid gap-6 sm:grid-cols-3">
                <div className="flex items-start gap-4">
                  <div className="mt-1 size-6 rounded-full border-2 border-[#4f7865] bg-[#4f7865]" />
                  <div>
                    <div className="text-[1rem] font-medium text-zinc-950">Step 1</div>
                    <div className="text-[1rem] leading-tight text-zinc-600">
                      Basic information
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="mt-1 size-6 rounded-full border-2 border-zinc-900 border-dashed bg-white" />
                  <div>
                    <div className="text-[1rem] font-medium text-zinc-950">Step 2</div>
                    <div className="text-[1rem] leading-tight text-zinc-600">
                      Map Selection
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="mt-1 size-6 rounded-full border-2 border-zinc-900 border-dashed bg-white" />
                  <div>
                    <div className="text-[1rem] font-medium text-zinc-950">Step 3</div>
                    <div className="text-[1rem] leading-tight text-zinc-600">
                      Parameters &amp; Impact
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <AlertDialogDescription className="mt-16 text-[1.05rem] leading-8 text-zinc-800">
              Lorem ipsum dolor sit lorem a amet, consectetur adipiscing elit,
              sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
              Ut enim ad minim veniam.
            </AlertDialogDescription>

            <div className="mt-11 space-y-9">
              <div>
                <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                  Activity Type
                </label>
                <Select>
                  <SelectTrigger className="h-14 w-full rounded-2xl border-zinc-200 bg-white px-5 text-lg text-zinc-900">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hunting">Hunting</SelectItem>
                    <SelectItem value="forestry">Forestry</SelectItem>
                    <SelectItem value="infrastructure">Infrastructure</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-3 text-[0.95rem] text-slate-500">
                  Choose between the pre-defined activity types
                </p>
              </div>

              <div>
                <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                  Activity Name
                </label>
                <Input
                  placeholder="E.g. Spring hunting season"
                  className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-zinc-400"
                />
                <p className="mt-3 text-[0.95rem] text-slate-500">
                  Give your activity a name
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                    Start Date
                  </label>
                  <Input
                    placeholder="Pick a date"
                    className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-slate-400"
                  />
                  <p className="mt-3 text-[0.95rem] text-slate-500">
                    Here is the caption
                  </p>
                </div>

                <div>
                  <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                    End Date
                  </label>
                  <Input
                    placeholder="Pick a date"
                    className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-slate-400"
                  />
                  <p className="mt-3 text-[0.95rem] text-slate-500">
                    Here is the caption
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-14 flex items-center justify-between gap-4">
              <AlertDialogCancel
                className="h-auto border-0 bg-transparent px-0 text-[1.1rem] font-medium text-zinc-700 shadow-none hover:bg-transparent hover:text-zinc-950"
              >
                Cancel
              </AlertDialogCancel>

              <Button
                type="button"
                onClick={() => setCreateStep(2)}
                className="h-14 rounded-2xl bg-[#4f7865] px-7 text-[1.05rem] font-medium text-white hover:bg-[#456b5a]"
              >
                Next: Select Area
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {createModalOpen && createStep === 2 ? (
        <div className="fixed top-[calc(var(--spacing-pane)*2+4.5rem)] right-6 z-50 w-[min(36rem,calc(50vw-2.5rem))] pointer-events-auto">
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-xl">
            <div className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[1rem] text-zinc-500">New management plan</p>
                  <h2 className="mt-2 text-[2rem] font-medium leading-none text-zinc-950">
                    Select Activity Area
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => handleCreateModalOpenChange(false)}
                  className="inline-flex size-10 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-100"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={1.8} />
                </button>
              </div>

              <div className="mt-8">
                <div className="h-1 w-full rounded-full bg-zinc-200">
                  <div className="h-full w-2/3 rounded-full bg-[#4f7865]" />
                </div>

                <div className="mt-4 grid gap-5 sm:grid-cols-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-5 items-center justify-center rounded-full border border-[#4f7865] text-[0.7rem] text-[#4f7865]">
                      ✓
                    </div>
                    <div>
                      <div className="text-[0.95rem] font-medium text-zinc-950">Step 1</div>
                      <div className="text-[0.95rem] leading-tight text-zinc-600">
                        Basic information
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 size-5 rounded-full border-2 border-[#4f7865] bg-[#4f7865]" />
                    <div>
                      <div className="text-[0.95rem] font-medium text-zinc-950">Step 2</div>
                      <div className="text-[0.95rem] leading-tight text-zinc-600">
                        Map Selection
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 size-5 rounded-full border border-zinc-900 border-dashed bg-white" />
                    <div>
                      <div className="text-[0.95rem] font-medium text-zinc-950">Step 3</div>
                      <div className="text-[0.95rem] leading-tight text-zinc-600">
                        Parameters &amp; Impact
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-10 text-[1.02rem] leading-8 text-zinc-800">
                Use the drawing tools on the map to define the area for this
                activity.
                <br />
                • Click points to draw a polygon
                <br />
                • Double-click to complete
                <br />
                • Selected area will be highlighted
                <br />
                <br />
                When you are done, click on the “save area” button to continue.
                You can always edit your selected area.
              </p>

              <div className="mt-8 rounded-2xl border border-zinc-300 bg-white px-4 py-3">
                <div className="text-[1rem] font-medium text-zinc-950">Selected Area</div>
                <div className="mt-4 space-y-2 text-[0.95rem] text-zinc-600">
                  <div className="flex items-center justify-between gap-6">
                    <span>Area size</span>
                    <span className="text-zinc-900">128km²</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span>Grid Cells</span>
                    <span className="text-zinc-900">40x32</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span>Coordinates</span>
                    <span className="text-zinc-900">57.7089°N, 11.9746°E</span>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex items-center justify-between gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreateStep(1)}
                  className="h-auto px-0 text-[1.1rem] font-medium text-zinc-700 hover:bg-transparent hover:text-zinc-950"
                >
                  Back
                </Button>

                <Button
                  type="button"
                  onClick={() => setCreateStep(3)}
                  className="h-12 rounded-2xl bg-[#4f7865] px-7 text-[1.05rem] font-medium text-white hover:bg-[#456b5a]"
                >
                  Next: Details
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {createModalOpen && createStep === 3 ? (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px]">
          <div className="flex h-full items-start justify-center px-6 pb-6 pt-[calc(var(--spacing-pane)*2+4.5rem)]">
            <div className="max-h-[calc(100vh-7rem)] w-[min(96rem,calc(100vw-3rem))] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-xl">
              <div className="p-7 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[1.05rem] text-zinc-500">New management plan</p>
                    <h2 className="mt-2 text-[2.1rem] font-medium leading-none text-zinc-950">
                      Select Activity Area
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCreateModalOpenChange(false)}
                    className="inline-flex size-10 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-100"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={1.8} />
                  </button>
                </div>

                <div className="mt-10">
                  <div className="h-1 w-full rounded-full bg-zinc-200">
                    <div className="h-full w-full rounded-full bg-[#4f7865]" />
                  </div>

                  <div className="mt-5 grid gap-6 sm:grid-cols-3">
                    <div className="flex items-start gap-4">
                      <div className="mt-1 flex size-6 items-center justify-center rounded-full border border-[#4f7865] text-[0.8rem] text-[#4f7865]">
                        ✓
                      </div>
                      <div>
                        <div className="text-[1rem] font-medium text-zinc-950">Step 1</div>
                        <div className="text-[1rem] leading-tight text-zinc-600">
                          Basic information
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="mt-1 flex size-6 items-center justify-center rounded-full border border-[#4f7865] text-[0.8rem] text-[#4f7865]">
                        ✓
                      </div>
                      <div>
                        <div className="text-[1rem] font-medium text-zinc-950">Step 2</div>
                        <div className="text-[1rem] leading-tight text-zinc-600">
                          Map Selection
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="mt-1 size-6 rounded-full border-2 border-[#4f7865] bg-[#4f7865]" />
                      <div>
                        <div className="text-[1rem] font-medium text-zinc-950">Step 3</div>
                        <div className="text-[1rem] leading-tight text-zinc-600">
                          Parameters &amp; Impact
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-16 text-[1.05rem] leading-8 text-zinc-800">
                  Lorem ipsum dolor sit lorem a amet, consectetur adipiscing elit,
                  sed do eiusmod tempor incididunt ut labore et dolore magna
                  aliqua. Ut enim ad minim veniam.
                </p>

                <div className="mt-10 grid gap-x-8 gap-y-10 lg:grid-cols-2">
                  <div>
                    <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                      Target / Objective
                    </label>
                    <Input
                      placeholder="E.g. deer/moose population control"
                      className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-zinc-400"
                    />
                  </div>

                  <div>
                    <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                      Label Text
                    </label>
                    <Textarea
                      placeholder="Describe the activity..."
                      className="min-h-36 rounded-2xl border-zinc-200 bg-white px-5 py-4 text-lg placeholder:text-slate-400"
                    />
                    <p className="mt-3 text-[0.95rem] text-slate-500">
                      Here is the caption
                    </p>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="text-[1rem] font-medium text-zinc-950">Financial</div>
                    <div className="mt-4 grid gap-8 lg:grid-cols-2">
                      <div>
                        <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                          Cost (SEK)
                        </label>
                        <Input
                          placeholder="0"
                          className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-slate-400"
                        />
                      </div>

                      <div>
                        <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                          Revenue (SEK)
                        </label>
                        <Input
                          placeholder="0.0"
                          className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="text-[1rem] font-medium text-zinc-950">
                      Ecological impact
                    </div>
                    <div className="mt-4 max-w-[46rem]">
                      <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                        Target biomass change (%)
                      </label>
                      <Input
                        placeholder="0"
                        className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="text-[1rem] font-medium text-zinc-950">
                      Affected Functional Groups
                    </div>
                    <div className="mt-5 grid gap-x-10 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
                      <label className="flex items-center gap-4 text-[1rem] text-zinc-950">
                        <input
                          type="checkbox"
                          defaultChecked
                          className="size-8 rounded-md border border-zinc-300 accent-[#1f2a44]"
                        />
                        <span>Vegetation</span>
                      </label>
                      <label className="flex items-center gap-4 text-[1rem] text-zinc-950">
                        <input
                          type="checkbox"
                          className="size-8 rounded-md border border-zinc-300 accent-[#1f2a44]"
                        />
                        <span>Deer/Moose</span>
                      </label>
                      <label className="flex items-center gap-4 text-[1rem] text-zinc-950">
                        <input
                          type="checkbox"
                          className="size-8 rounded-md border border-zinc-300 accent-[#1f2a44]"
                        />
                        <span>Wolf/Lynx</span>
                      </label>
                      <label className="flex items-center gap-4 text-[1rem] text-zinc-950">
                        <input
                          type="checkbox"
                          className="size-8 rounded-md border border-zinc-300 accent-[#1f2a44]"
                        />
                        <span>Birds of prey</span>
                      </label>
                      <label className="flex items-center gap-4 text-[1rem] text-zinc-950">
                        <input
                          type="checkbox"
                          className="size-8 rounded-md border border-zinc-300 accent-[#1f2a44]"
                        />
                        <span>Rodents/Small mammals</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-16 flex items-center justify-end gap-8">
                  <button
                    type="button"
                    onClick={() => handleCreateModalOpenChange(false)}
                    className="text-[1.2rem] font-medium text-zinc-700 transition-colors hover:text-zinc-950"
                  >
                    Cancel
                  </button>

                  <Button
                    type="button"
                    className="h-14 rounded-2xl bg-[#4f7865] px-10 text-[1.2rem] font-medium text-white hover:bg-[#456b5a]"
                  >
                    Create Activity
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
