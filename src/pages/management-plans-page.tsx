import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  activityTypeOptions as domainActivityTypeOptions,
  constructionCategories,
  createDefaultSpeciesEffortMultipliers,
  getActivityTypeLabel,
  getConstructionCategoryLabel,
  isConstantAreaActivityType,
  marineSpecies,
} from "@/config/ecotwin-domain"
import {
  type ActivityAreaPoint,
  isValidActivityArea,
  summarizeActivityArea,
  toActivityAreaGeometry,
} from "@/lib/activity-area"
import { cn } from "@/lib/utils"
import {
  createManagementPlan,
  createTask,
  deleteTask,
  updateManagementPlan,
  updateTask,
} from "@/state/ecotwin-api"
import {
  fetchManagementPlanByIdAtom,
  managementPlanByIdCacheAtom,
  managementPlanByIdLoadingAtom,
  managementPlansAtom,
  managementPlansErrorAtom,
  managementPlansLoadingAtom,
  refreshManagementPlansAtom,
  refreshTilesAtom,
  tilesListAtom,
  tilesLoadingAtom,
} from "@/state/ecotwin-atoms"
import {
  activityAreaDrawingActiveAtom,
  activityAreaHoverPointAtom,
  activityAreaPointsAtom,
} from "@/state/activity-area-state"
import type { ManagementPlan, Task, TaskData, TaskTiming, TaskType, Tile } from "@/state/ecotwin-types"
import { ArrowLeft01Icon, Cancel01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"

type PlanRow = {
  id: string
  name: string
  locationName: string
  activityCount: number
  startDate: string
  endDate: string
  costLabel: string
  revenueLabel: string
  statusLabel: string
}

type CreatePlanFormState = {
  name: string
  tileId: string
}

type CreateActivityFormState = {
  activityType: TaskType | ""
  activityName: string
  timingMode: TaskTiming
  startDate: string
  endDate: string
  objective: string
  description: string
  cost: string
  revenue: string
  targetScope: "wholeTile" | "polygon"
  speciesEffortMultipliers: Record<string, string>
  constructionCategory: string
  constructionIntensity: string
  constructionDescription: string
}

const activityTypeOptions: Array<{
  value: TaskType
  label: string
}> = domainActivityTypeOptions.map((option) => ({
  value: option.id as TaskType,
  label: option.label,
}))

const TIMELINE_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]
const TIMELINE_MONTH_WIDTH = 180
const TIMELINE_EDGE_EXTENSION_MONTHS = 12
const TIMELINE_EDGE_THRESHOLD_MONTHS = 4
const TIMELINE_INITIAL_PADDING_MONTHS = 12

type TimelineMonth = {
  key: string
  label: string
  year: number
  monthIndex: number
  date: Date
}

const activityAccentClasses: Record<string, string> = {
  fishing: "border-cyan-400 bg-cyan-50/90",
  construction: "border-orange-400 bg-orange-50/90",
  windFarm: "border-emerald-400 bg-emerald-50/90",
  seaLane: "border-blue-400 bg-blue-50/90",
  trawlArea: "border-rose-400 bg-rose-50/90",
  activity: "border-zinc-300 bg-white/90",
}

const activityTopBorderClasses: Record<string, string> = {
  fishing: "border-cyan-500",
  construction: "border-orange-500",
  windFarm: "border-emerald-500",
  seaLane: "border-blue-500",
  trawlArea: "border-rose-500",
  activity: "border-zinc-400",
}

function createInitialPlanFormState(): CreatePlanFormState {
  return {
    name: "",
    tileId: "",
  }
}

function createInitialActivityFormState(): CreateActivityFormState {
  return {
    activityType: "",
    activityName: "",
    timingMode: "scheduled",
    startDate: "",
    endDate: "",
    objective: "",
    description: "",
    cost: "",
    revenue: "",
    targetScope: "polygon",
    speciesEffortMultipliers: createDefaultSpeciesEffortMultipliers(),
    constructionCategory: constructionCategories[0]?.id ?? "",
    constructionIntensity: "",
    constructionDescription: "",
  }
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

function trimToUndefined(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function numberFromInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isSameAreaPoint(left: readonly [number, number], right: readonly [number, number]) {
  return left[0] === right[0] && left[1] === right[1]
}

function isActivityAreaClosed(points: readonly [number, number][]) {
  if (points.length < 4) return false
  return isSameAreaPoint(points[0], points[points.length - 1])
}

function closeActivityAreaPoints(points: readonly [number, number][]) {
  if (points.length < 3) return [...points]
  if (isActivityAreaClosed(points)) return [...points]
  return [...points, points[0]]
}

function getActivityAreaVertexCount(points: readonly [number, number][]) {
  return isActivityAreaClosed(points) ? Math.max(0, points.length - 1) : points.length
}

function formatAreaKm2(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return `${new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)} km²`
}

function formatCoordinate(value?: number, axis?: "lat" | "lng") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  const suffix =
    axis === "lat" ? (value >= 0 ? "N" : "S") : axis === "lng" ? (value >= 0 ? "E" : "W") : ""
  return `${Math.abs(value).toFixed(4)}°${suffix}`
}

function toMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function taskData(task?: Task): TaskData | undefined {
  const value = task?.data
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value
}

function getTaskTiming(task?: Task): TaskTiming {
  const timing = taskData(task)?.timing
  if (timing === "constant" || timing === "scheduled") return timing
  return task?.start || task?.end ? "scheduled" : "constant"
}

function isConstantTask(task?: Task) {
  return getTaskTiming(task) === "constant"
}

function formatTaskTiming(task: Task) {
  if (isConstantTask(task)) return "Constant"
  return `${formatDate(task.start)} to ${formatDate(task.end)}`
}

function planLocationName(plan?: ManagementPlan | null) {
  const expandedTile = plan?.expand?.tile
  if (expandedTile?.name?.trim()) return expandedTile.name.trim()
  if (plan?.tile) return "Unnamed location"
  return "No location"
}

function extractActivityAreaPoints(value: unknown): ActivityAreaPoint[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const geometry = value as {
    type?: unknown
    coordinates?: unknown
  }
  if (geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) return []
  const firstRing = geometry.coordinates[0]
  if (!Array.isArray(firstRing)) return []

  const normalized = firstRing
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null
      const lng = Number(point[0])
      const lat = Number(point[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
      return [lng, lat] as ActivityAreaPoint
    })
    .filter((point): point is ActivityAreaPoint => Boolean(point))

  if (normalized.length >= 2 && isSameAreaPoint(normalized[0], normalized[normalized.length - 1])) {
    return normalized.slice(0, -1)
  }

  return normalized
}

function createActivityFormFromTask(task: Task): CreateActivityFormState {
  const data = taskData(task)
  const multipliers = createDefaultSpeciesEffortMultipliers()
  if (
    data?.speciesEffortMultipliers &&
    typeof data.speciesEffortMultipliers === "object"
  ) {
    for (const species of marineSpecies) {
      const value = data.speciesEffortMultipliers[species.id]
      if (typeof value === "number" && Number.isFinite(value)) {
        multipliers[species.id] = String(value)
      }
    }
  }
  const construction =
    data?.construction && typeof data.construction === "object"
      ? data.construction
      : undefined

  return {
    activityType: task.type,
    activityName: task.name || "",
    timingMode: getTaskTiming(task),
    startDate: task.start ? formatDate(task.start) : "",
    endDate: task.end ? formatDate(task.end) : "",
    objective: typeof data?.objective === "string" ? data.objective : "",
    description: typeof data?.description === "string" ? data.description : "",
    cost: typeof data?.cost === "number" ? String(data.cost) : "",
    revenue: typeof data?.revenue === "number" ? String(data.revenue) : "",
    targetScope:
      data?.targetScope === "wholeTile" || data?.targetScope === "polygon"
        ? data.targetScope
        : data?.area
          ? "polygon"
          : "wholeTile",
    speciesEffortMultipliers: multipliers,
    constructionCategory:
      typeof construction?.category === "string"
        ? construction.category
        : constructionCategories[0]?.id ?? "",
    constructionIntensity:
      typeof construction?.intensity === "number" ? String(construction.intensity) : "",
    constructionDescription:
      typeof construction?.description === "string" ? construction.description : "",
  }
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const left = isConstantTask(a) ? a.name ?? a.created ?? "" : a.start ?? a.created ?? ""
    const right = isConstantTask(b) ? b.name ?? b.created ?? "" : b.start ?? b.created ?? ""
    return left.localeCompare(right)
  })
}

function getPlanTasks(plan?: ManagementPlan | null) {
  return sortTasks(plan?.expand?.tasks ?? [])
}

function getPlanTaskIds(plan?: ManagementPlan | null) {
  if (!plan) return []
  if (Array.isArray(plan.tasks) && plan.tasks.length) return plan.tasks
  return plan.expand?.tasks?.map((task) => task.id) ?? []
}

function sumTaskMetric(tasks: Task[], key: "cost" | "revenue") {
  const total = tasks.reduce((sum, task) => {
    const value = taskData(task)?.[key]
    return typeof value === "number" && Number.isFinite(value) ? sum + value : sum
  }, 0)

  return total > 0 ? total : null
}

function pickTaskDates(tasks: Task[], fallbackCreated?: string) {
  const scheduledTasks = tasks.filter((task) => !isConstantTask(task))
  const starts = scheduledTasks
    .map((task) => task.start)
    .filter((value): value is string => Boolean(value))
    .sort()
  const ends = scheduledTasks
    .map((task) => task.end)
    .filter((value): value is string => Boolean(value))
    .sort()

  if (!starts.length && !ends.length && tasks.some((task) => isConstantTask(task))) {
    return {
      startDate: "Constant",
      endDate: "Constant",
    }
  }

  return {
    startDate: starts.length ? formatDate(starts[0]) : formatDate(fallbackCreated),
    endDate: ends.length ? formatDate(ends.at(-1)) : "—",
  }
}

function toPlanRow(plan: ManagementPlan): PlanRow {
  const tasks = getPlanTasks(plan)
  const { startDate, endDate } = pickTaskDates(tasks, plan.created)
  const totalCost = sumTaskMetric(tasks, "cost")
  const totalRevenue = sumTaskMetric(tasks, "revenue")

  return {
    id: plan.id,
    name: plan.name?.trim() || "Untitled plan",
    locationName: planLocationName(plan),
    activityCount: tasks.length,
    startDate,
    endDate,
    costLabel: formatCurrency(totalCost),
    revenueLabel: formatCurrency(totalRevenue),
    statusLabel: tasks.length ? `${tasks.length} activit${tasks.length === 1 ? "y" : "ies"}` : "Empty plan",
  }
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function monthDiff(start: Date, end: Date) {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
}

function parseTaskDate(value?: string, fallback?: Date) {
  if (!value) return fallback ?? new Date()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback ?? new Date()
  return parsed
}

function buildTimelineMonths(start: Date, end: Date) {
  const months: TimelineMonth[] = []
  const count = monthDiff(start, end)

  for (let index = 0; index <= count; index += 1) {
    const date = addMonths(start, index)
    months.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: TIMELINE_MONTH_LABELS[date.getMonth()],
      year: date.getFullYear(),
      monthIndex: date.getMonth(),
      date,
    })
  }

  return months
}

function getTimelineBounds(tasks: Task[], fallbackCreated?: string) {
  const fallback = startOfMonth(parseTaskDate(fallbackCreated))
  const scheduledTasks = tasks.filter((task) => !isConstantTask(task))
  if (!scheduledTasks.length) {
    return {
      start: addMonths(fallback, -TIMELINE_INITIAL_PADDING_MONTHS),
      end: addMonths(fallback, TIMELINE_INITIAL_PADDING_MONTHS),
      earliest: fallback,
      latest: fallback,
    }
  }

  const starts = scheduledTasks.map((task) => startOfMonth(parseTaskDate(task.start ?? task.created, fallback)))
  const ends = scheduledTasks.map((task) =>
    startOfMonth(parseTaskDate(task.end ?? task.start ?? task.created, fallback))
  )
  const earliest = starts.reduce((min, current) => (current < min ? current : min), starts[0])
  const latest = ends.reduce((max, current) => (current > max ? current : max), ends[0])

  return {
    start: addMonths(earliest, -TIMELINE_INITIAL_PADDING_MONTHS),
    end: addMonths(latest, TIMELINE_INITIAL_PADDING_MONTHS),
    earliest,
    latest,
  }
}

function getTaskGridPlacement(task: Task, timelineStart: Date, timelineMonthCount: number) {
  if (isConstantTask(task)) {
    return {
      startCol: 1,
      span: Math.max(1, timelineMonthCount),
    }
  }

  const fallback = timelineStart
  const safeStart = startOfMonth(parseTaskDate(task.start ?? task.created, fallback))
  const safeEnd = startOfMonth(parseTaskDate(task.end ?? task.start ?? task.created, safeStart))

  const lastMonthIndex = Math.max(0, timelineMonthCount - 1)
  const startMonth = Math.min(lastMonthIndex, Math.max(0, monthDiff(timelineStart, safeStart)))
  const endMonth = Math.min(lastMonthIndex, Math.max(startMonth, monthDiff(timelineStart, safeEnd)))

  return {
    startCol: startMonth + 1,
    span: Math.max(1, endMonth - startMonth + 1),
  }
}

function renderActivitySummary(task: Task) {
  const data = taskData(task)
  const multiplierLines =
    task.type === "fishing" && data?.speciesEffortMultipliers
      ? marineSpecies
          .map((species) => {
            const value = data.speciesEffortMultipliers?.[species.id]
            return typeof value === "number" && Number.isFinite(value)
              ? `${species.label}: ${value}x effort`
              : null
          })
          .filter((value): value is string => Boolean(value))
      : []
  const constructionLines =
    task.type === "construction" && data?.construction
      ? [
          data.construction.category
            ? `Category: ${getConstructionCategoryLabel(data.construction.category)}`
            : null,
          typeof data.construction.intensity === "number"
            ? `Intensity: ${data.construction.intensity}`
            : null,
          data.construction.description ? `Construction: ${data.construction.description}` : null,
        ].filter((value): value is string => Boolean(value))
      : []
  const lines = [
    `Type: ${getActivityTypeLabel(task.type)}`,
    `Timing: ${formatTaskTiming(task)}`,
    data?.objective ? `Target: ${data.objective}` : null,
    data?.description ? `Details: ${data.description}` : null,
    data?.targetScope === "wholeTile" ? "Area: Whole tile" : null,
    ...multiplierLines,
    ...constructionLines,
    typeof data?.cost === "number" ? `Cost: ${formatCurrency(data.cost)} SEK` : null,
    typeof data?.revenue === "number" ? `Revenue: ${formatCurrency(data.revenue)} SEK` : null,
  ].filter((value): value is string => Boolean(value))

  return lines.slice(0, 7)
}

function formatActivityTarget(task: Task) {
  const objective = taskData(task)?.objective
  return objective ? `Target: ${objective}` : null
}

export function ManagementPlansPage() {
  const navigate = useNavigate()
  const { planId } = useParams<{ planId?: string }>()
  const [searchParams] = useSearchParams()
  const filteredTileId = searchParams.get("tile")?.trim() || ""

  const plans = useAtomValue(managementPlansAtom)
  const loading = useAtomValue(managementPlansLoadingAtom)
  const error = useAtomValue(managementPlansErrorAtom)
  const managementPlanByIdCache = useAtomValue(managementPlanByIdCacheAtom)
  const planLoading = useAtomValue(managementPlanByIdLoadingAtom)
  const tiles = useAtomValue(tilesListAtom)
  const tilesLoading = useAtomValue(tilesLoadingAtom)

  const refreshPlans = useSetAtom(refreshManagementPlansAtom)
  const refreshTiles = useSetAtom(refreshTilesAtom)
  const fetchManagementPlanById = useSetAtom(fetchManagementPlanByIdAtom)
  const areaPoints = useAtomValue(activityAreaPointsAtom)
  const setAreaPoints = useSetAtom(activityAreaPointsAtom)
  const setAreaHoverPoint = useSetAtom(activityAreaHoverPointAtom)
  const setAreaDrawingActive = useSetAtom(activityAreaDrawingActiveAtom)

  const [createPlanModalOpen, setCreatePlanModalOpen] = useState(false)
  const [createPlanForm, setCreatePlanForm] = useState<CreatePlanFormState>(() =>
    createInitialPlanFormState()
  )
  const [createPlanError, setCreatePlanError] = useState<string | null>(null)
  const [isCreatingPlan, setIsCreatingPlan] = useState(false)

  const [createActivityModalOpen, setCreateActivityModalOpen] = useState(false)
  const [createActivityStep, setCreateActivityStep] = useState<1 | 2 | 3>(1)
  const [createActivityForm, setCreateActivityForm] = useState<CreateActivityFormState>(() =>
    createInitialActivityFormState()
  )
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [createActivityError, setCreateActivityError] = useState<string | null>(null)
  const [isCreatingActivity, setIsCreatingActivity] = useState(false)
  const [activityAreaStepMode, setActivityAreaStepMode] = useState<"review" | "draw">("draw")
  const [timelineRange, setTimelineRange] = useState(() => {
    const base = startOfMonth(new Date())
    return {
      start: addMonths(base, -TIMELINE_INITIAL_PADDING_MONTHS),
      end: addMonths(base, TIMELINE_INITIAL_PADDING_MONTHS),
    }
  })

  const timelineScrollRef = useRef<HTMLDivElement | null>(null)
  const initialTimelineSpanRef = useRef<{ startIndex: number; endIndex: number } | null>(null)
  const prependScrollAdjustmentRef = useRef(0)
  const lastTimelinePlanRef = useRef<string | null>(null)

  useEffect(() => {
    if (plans !== null || loading || error) return
    void refreshPlans()
  }, [error, loading, plans, refreshPlans])

  useEffect(() => {
    if (tiles !== null || tilesLoading) return
    void refreshTiles({ page: 1, perPage: 200, sort: "name" })
  }, [refreshTiles, tiles, tilesLoading])

  useEffect(() => {
    if (!planId) return
    const cached = managementPlanByIdCache[planId] ?? plans?.find((plan) => plan.id === planId)
    if (cached) return
    void fetchManagementPlanById({ id: planId })
  }, [fetchManagementPlanById, managementPlanByIdCache, planId, plans])

  const filteredPlans = useMemo(() => {
    if (!plans) return []
    if (!filteredTileId) return plans
    return plans.filter((plan) => plan.tile === filteredTileId || plan.expand?.tile?.id === filteredTileId)
  }, [filteredTileId, plans])

  const activePlan = useMemo(() => {
    if (!planId) return null
    return plans?.find((plan) => plan.id === planId) ?? managementPlanByIdCache[planId] ?? null
  }, [managementPlanByIdCache, planId, plans])
  const locationOptions = useMemo(
    () =>
      [...(tiles?.items ?? [])].sort((left, right) =>
        (left.name?.trim() || "Untitled location").localeCompare(
          right.name?.trim() || "Untitled location"
        )
      ),
    [tiles?.items]
  )
  const filteredLocation = useMemo(
    () => locationOptions.find((tile) => tile.id === filteredTileId) ?? null,
    [filteredTileId, locationOptions]
  )
  const activeTasks = useMemo(() => getPlanTasks(activePlan), [activePlan])
  const timelineMonths = useMemo(
    () => buildTimelineMonths(timelineRange.start, timelineRange.end),
    [timelineRange.end, timelineRange.start]
  )
  const timelineGridTemplate = useMemo(
    () => `repeat(${timelineMonths.length}, minmax(${TIMELINE_MONTH_WIDTH}px, ${TIMELINE_MONTH_WIDTH}px))`,
    [timelineMonths.length]
  )
  const selectedAreaSummary = useMemo(() => summarizeActivityArea(areaPoints), [areaPoints])
  const hasValidSelectedArea = useMemo(() => isValidActivityArea(areaPoints), [areaPoints])
  const isSelectedAreaClosed = useMemo(() => isActivityAreaClosed(areaPoints), [areaPoints])
  const editingTask = useMemo(
    () => activeTasks.find((task) => task.id === editingTaskId) ?? null,
    [activeTasks, editingTaskId]
  )
  const isEditingActivity = Boolean(editingTaskId)
  const isEditingExistingArea =
    isEditingActivity &&
    createActivityStep === 2 &&
    activityAreaStepMode === "review" &&
    hasValidSelectedArea
 

  useEffect(() => {
    if (!planId || !activePlan) return
    const nextPlanKey = `${planId}:${activeTasks.length}:${activePlan.updated ?? activePlan.created ?? ""}`
    if (lastTimelinePlanRef.current === nextPlanKey) return

    const bounds = getTimelineBounds(activeTasks, activePlan.created)
    setTimelineRange({
      start: bounds.start,
      end: bounds.end,
    })

    const earliestIndex = Math.max(0, monthDiff(bounds.start, bounds.earliest))
    const latestIndex = Math.max(earliestIndex, monthDiff(bounds.start, bounds.latest))
    initialTimelineSpanRef.current = {
      startIndex: earliestIndex,
      endIndex: latestIndex,
    }
    prependScrollAdjustmentRef.current = 0
    lastTimelinePlanRef.current = nextPlanKey
  }, [activePlan, activeTasks, planId])

  useLayoutEffect(() => {
    const scroller = timelineScrollRef.current
    if (!scroller) return

    if (prependScrollAdjustmentRef.current) {
      scroller.scrollLeft += prependScrollAdjustmentRef.current
      prependScrollAdjustmentRef.current = 0
    }

    if (initialTimelineSpanRef.current) {
      const { startIndex, endIndex } = initialTimelineSpanRef.current
      const startLeft = startIndex * TIMELINE_MONTH_WIDTH
      const endRight = (endIndex + 1) * TIMELINE_MONTH_WIDTH
      const spanWidth = endRight - startLeft
      const centeredTarget = startLeft - (scroller.clientWidth - spanWidth) / 2
      const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
      scroller.scrollLeft = Math.min(maxLeft, Math.max(0, centeredTarget))
      initialTimelineSpanRef.current = null
    }
  }, [timelineMonths.length])

  function handleTimelineScroll() {
    const scroller = timelineScrollRef.current
    if (!scroller) return

    const edgeThreshold = TIMELINE_MONTH_WIDTH * TIMELINE_EDGE_THRESHOLD_MONTHS

    if (scroller.scrollLeft < edgeThreshold) {
      prependScrollAdjustmentRef.current +=
        TIMELINE_MONTH_WIDTH * TIMELINE_EDGE_EXTENSION_MONTHS
      setTimelineRange((prev) => ({
        start: addMonths(prev.start, -TIMELINE_EDGE_EXTENSION_MONTHS),
        end: prev.end,
      }))
      return
    }

    if (scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft < edgeThreshold) {
      setTimelineRange((prev) => ({
        start: prev.start,
        end: addMonths(prev.end, TIMELINE_EDGE_EXTENSION_MONTHS),
      }))
    }
  }

  function resetCreatePlanState() {
    setCreatePlanForm({
      ...createInitialPlanFormState(),
      tileId: filteredTileId,
    })
    setCreatePlanError(null)
    setIsCreatingPlan(false)
  }

  function handleCreatePlanModalOpenChange(nextOpen: boolean) {
    setCreatePlanModalOpen(nextOpen)
    if (nextOpen) {
      setCreatePlanForm({
        ...createInitialPlanFormState(),
        tileId: filteredTileId,
      })
      setCreatePlanError(null)
      return
    }
    resetCreatePlanState()
  }

  async function handleCreatePlan() {
    const name = createPlanForm.name.trim()
    if (!name) {
      setCreatePlanError("Enter a management plan name before continuing.")
      return
    }
    if (!createPlanForm.tileId) {
      setCreatePlanError("Choose a location for this management plan before continuing.")
      return
    }

    setIsCreatingPlan(true)
    setCreatePlanError(null)

    try {
      const plan = await createManagementPlan({ name, tile: createPlanForm.tileId })
      await refreshPlans()
      handleCreatePlanModalOpenChange(false)
      navigate(`/management-plans/${plan.id}`)
    } catch (err) {
      setCreatePlanError(`Failed to create management plan: ${toMessage(err)}`)
    } finally {
      setIsCreatingPlan(false)
    }
  }

  function resetCreateActivityState() {
    setCreateActivityForm(createInitialActivityFormState())
    setCreateActivityStep(1)
    setActivityAreaStepMode("draw")
    setEditingTaskId(null)
    setCreateActivityError(null)
    setIsCreatingActivity(false)
    setAreaPoints([])
    setAreaHoverPoint(null)
    setAreaDrawingActive(false)
  }

  function handleCreateActivityModalOpenChange(nextOpen: boolean) {
    setCreateActivityModalOpen(nextOpen)
    if (!nextOpen) resetCreateActivityState()
  }

  function openEditActivity(task: Task) {
    const existingAreaPoints = extractActivityAreaPoints(taskData(task)?.area)
    setEditingTaskId(task.id)
    setCreateActivityForm(createActivityFormFromTask(task))
    setCreateActivityStep(1)
    setActivityAreaStepMode(existingAreaPoints.length >= 3 ? "review" : "draw")
    setCreateActivityError(null)
    setIsCreatingActivity(false)
    setAreaPoints(existingAreaPoints)
    setAreaHoverPoint(null)
    setCreateActivityModalOpen(true)
  }

  function updateActivityForm<K extends keyof CreateActivityFormState>(
    key: K,
    value: CreateActivityFormState[K]
  ) {
    setCreateActivityForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleActivityStepOneNext() {
    if (!createActivityForm.activityType) {
      setCreateActivityError("Choose an activity type before continuing.")
      return
    }

    if (!createActivityForm.activityName.trim()) {
      setCreateActivityError("Enter an activity name before continuing.")
      return
    }

    if (createActivityForm.timingMode === "scheduled") {
      if (!createActivityForm.startDate || !createActivityForm.endDate) {
        setCreateActivityError("Set a start and end date, or change timing to Constant.")
        return
      }
      if (createActivityForm.endDate < createActivityForm.startDate) {
        setCreateActivityError("Set an end date that is on or after the start date.")
        return
      }
    }

    if (createActivityForm.targetScope === "wholeTile") {
      setCreateActivityError(null)
      setAreaPoints([])
      setAreaHoverPoint(null)
      setActivityAreaStepMode("draw")
      setCreateActivityStep(3)
      return
    }

    const existingAreaPoints = editingTask ? extractActivityAreaPoints(taskData(editingTask)?.area) : []
    setCreateActivityError(null)
    setAreaPoints((prev) => {
      if (prev.length) return prev
      return existingAreaPoints
    })
    setAreaHoverPoint(null)
    setActivityAreaStepMode(existingAreaPoints.length >= 3 ? "review" : "draw")
    setCreateActivityStep(2)
  }

  function handleAdjustExistingActivityArea() {
    setCreateActivityError(null)
    setActivityAreaStepMode("draw")
    setAreaPoints((prev) => {
      if (!isActivityAreaClosed(prev)) return prev
      return prev.slice(0, -1)
    })
    setAreaHoverPoint(null)
  }

  function handleRedrawActivityArea() {
    setCreateActivityError(null)
    setActivityAreaStepMode("draw")
    setAreaPoints([])
    setAreaHoverPoint(null)
  }

  function handleCloseActivityArea() {
    if (!hasValidSelectedArea) return
    setAreaPoints((prev) => closeActivityAreaPoints(prev))
    setAreaHoverPoint(null)
  }

  function handleActivityStepTwoNext() {
    if (!hasValidSelectedArea) {
      setCreateActivityError("Draw an activity area on the map before continuing.")
      return
    }

    setCreateActivityError(null)
    setAreaPoints((prev) => closeActivityAreaPoints(prev))
    setAreaHoverPoint(null)
    setCreateActivityStep(3)
  }

  async function handleSubmitActivity() {
    if (!activePlan) {
      setCreateActivityError("No active management plan selected.")
      return
    }

    const activityName = createActivityForm.activityName.trim()
    if (!createActivityForm.activityType) {
      setCreateActivityError("Choose an activity type before creating the activity.")
      setCreateActivityStep(1)
      return
    }
    if (!activityName) {
      setCreateActivityError("Enter an activity name before creating the activity.")
      setCreateActivityStep(1)
      return
    }
    if (createActivityForm.timingMode === "scheduled") {
      if (!createActivityForm.startDate || !createActivityForm.endDate) {
        setCreateActivityError("Set a start and end date, or change timing to Constant.")
        setCreateActivityStep(1)
        return
      }
      if (createActivityForm.endDate < createActivityForm.startDate) {
        setCreateActivityError("Set an end date that is on or after the start date.")
        setCreateActivityStep(1)
        return
      }
    }

    const data: TaskData = {
      timing: createActivityForm.timingMode,
      status: "Planned",
      targetScope: createActivityForm.targetScope,
    }

    if (createActivityForm.targetScope === "polygon") {
      const activityArea = toActivityAreaGeometry(areaPoints)
      const activityAreaSummary = summarizeActivityArea(areaPoints)
      if (!activityArea || !activityAreaSummary) {
        setCreateActivityError("Draw an activity area on the map before creating the activity.")
        setCreateActivityStep(2)
        setAreaDrawingActive(true)
        return
      }

      data.area = activityArea
      data.areaSummary = activityAreaSummary
    }

    const objective = trimToUndefined(createActivityForm.objective)
    const description = trimToUndefined(createActivityForm.description)
    const cost = numberFromInput(createActivityForm.cost)
    const revenue = numberFromInput(createActivityForm.revenue)

    if (objective) data.objective = objective
    if (description) data.description = description
    if (cost !== undefined) data.cost = cost
    if (revenue !== undefined) data.revenue = revenue

    if (createActivityForm.activityType === "fishing") {
      const speciesEffortMultipliers: Record<string, number> = {}
      for (const species of marineSpecies) {
        const raw = createActivityForm.speciesEffortMultipliers[species.id] ?? ""
        const value = Number(raw)
        if (!Number.isFinite(value) || value < 0) {
          setCreateActivityError(`Enter a non-negative effort multiplier for ${species.label}.`)
          setCreateActivityStep(3)
          return
        }
        speciesEffortMultipliers[species.id] = value
      }
      data.speciesEffortMultipliers = speciesEffortMultipliers
    }

    if (createActivityForm.activityType === "construction") {
      const category = createActivityForm.constructionCategory
      const categoryExists = constructionCategories.some((option) => option.id === category)
      const intensity = numberFromInput(createActivityForm.constructionIntensity)
      if (!categoryExists) {
        setCreateActivityError("Choose a construction category.")
        setCreateActivityStep(3)
        return
      }
      if (intensity === undefined || intensity < 0) {
        setCreateActivityError("Enter a non-negative construction intensity.")
        setCreateActivityStep(3)
        return
      }
      data.construction = {
        category,
        intensity,
      }
      const constructionDescription = trimToUndefined(createActivityForm.constructionDescription)
      if (constructionDescription) data.construction.description = constructionDescription
    }

    setIsCreatingActivity(true)
    setCreateActivityError(null)

    try {
      const start = createActivityForm.timingMode === "constant" ? "" : createActivityForm.startDate
      const end = createActivityForm.timingMode === "constant" ? "" : createActivityForm.endDate
      if (editingTask) {
        await updateTask(editingTask.id, {
          name: activityName,
          type: createActivityForm.activityType,
          start,
          end,
          data,
        })
      } else {
        let createdTaskId: string | undefined
        try {
          const task = await createTask({
            name: activityName,
            type: createActivityForm.activityType,
            start,
            end,
            data,
          })
          createdTaskId = task.id

          await updateManagementPlan(activePlan.id, {
            tasks: [...getPlanTaskIds(activePlan), task.id],
          })
        } catch (err) {
          if (createdTaskId) {
            await deleteTask(createdTaskId).catch(() => {})
          }
          throw err
        }
      }

      await refreshPlans()
      await fetchManagementPlanById({ id: activePlan.id })
      handleCreateActivityModalOpenChange(false)
    } catch (err) {
      setCreateActivityError(
        `${isEditingActivity ? "Failed to update activity" : "Failed to create activity"}: ${toMessage(err)}`
      )
    } finally {
      setIsCreatingActivity(false)
    }
  }

  useEffect(() => {
    const isMapDrawingActive =
      createActivityModalOpen && createActivityStep === 2 && activityAreaStepMode === "draw"
    setAreaDrawingActive(isMapDrawingActive)
    if (!isMapDrawingActive) {
      setAreaHoverPoint(null)
    }
  }, [
    activityAreaStepMode,
    createActivityModalOpen,
    createActivityStep,
    setAreaDrawingActive,
    setAreaHoverPoint,
  ])

  if (planId) {
    return (
      <section className="pointer-events-none absolute inset-x-0 bottom-0 top-[4.5rem] z-30 px-1 pb-1 pt-0 sm:px-2 sm:pb-2">
        <div className="grid h-full grid-cols-1 gap-1.5 lg:grid-cols-2">
          <div className="relative min-h-0">
            <button
              type="button"
              onClick={() => navigate("/management-plans")}
              className="pointer-events-auto absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/90 px-3 py-2 text-sm font-medium text-zinc-700 shadow-md backdrop-blur-md transition-colors hover:text-zinc-950"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
              Plans
            </button>

            <div className="pointer-events-auto absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-2xl bg-zinc-900/92 px-4 py-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
              {createActivityModalOpen && createActivityStep === 2 && activityAreaStepMode === "draw" ? (
                <div className="flex items-center gap-3 text-[0.72rem]">
                  <div className="rounded-md bg-[#3f5a50] px-3 py-2 font-medium text-white">
                    Click map to add points
                  </div>
                  <div className="text-white/75">{areaPoints.length} point{areaPoints.length === 1 ? "" : "s"}</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!hasValidSelectedArea || isSelectedAreaClosed}
                    onClick={handleCloseActivityArea}
                    className="h-8 rounded-md px-3 text-white hover:bg-white/10 hover:text-white disabled:text-white/35"
                  >
                    Finish shape
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!areaPoints.length}
                    onClick={() => setAreaPoints((prev) => prev.slice(0, -1))}
                    className="h-8 rounded-md px-3 text-white hover:bg-white/10 hover:text-white disabled:text-white/35"
                  >
                    Undo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!areaPoints.length}
                    onClick={() => {
                      setAreaPoints([])
                      setAreaHoverPoint(null)
                    }}
                    className="h-8 rounded-md px-3 text-white hover:bg-white/10 hover:text-white disabled:text-white/35"
                  >
                    Clear
                  </Button>
                </div>
              ) : createActivityModalOpen && createActivityStep === 2 ? (
                <div className="flex items-center gap-5 text-[0.72rem]">
                  <div className="rounded-md bg-[#3f5a50] px-3 py-2 font-medium text-white">
                    Existing area loaded
                  </div>
                  <span className="text-white/75">
                    Review it first, then choose whether to adjust or redraw.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-5 text-[0.72rem]">
                  <div className="flex items-center gap-2">
                    <div className="grid size-6 place-items-center rounded-md bg-[#3f5a50]">
                      <span className="text-[0.7rem]">⌖</span>
                    </div>
                    <span>Activities</span>
                  </div>
                  <span className="opacity-70">{activeTasks.length} total</span>
                  <span className="opacity-70">Select a plan activity to inspect</span>
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-auto min-h-0 overflow-hidden rounded-[0.35rem] border border-zinc-300/80 bg-[#f8f7f3] shadow-[0_18px_40px_rgba(0,0,0,0.12)]">
            {activePlan ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-zinc-200 bg-white/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => handleCreateActivityModalOpenChange(true)}
                      className="h-8 rounded-md bg-black px-3 text-[0.8rem] font-medium text-white hover:bg-black/90"
                    >
                      Create New +
                    </Button>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-7 py-8">
                    <div>
                      <div className="text-[0.72rem] uppercase tracking-[0.2em] text-zinc-400">
                        {activePlan.name || "Untitled plan"}
                      </div>
                      <div className="mt-2 text-sm text-zinc-500">
                        Location: {planLocationName(activePlan)}
                      </div>
                    </div>
                    <div className="text-[1.15rem] font-semibold tracking-[0.08em] text-zinc-700">
                      {timelineMonths[0]?.year === timelineMonths.at(-1)?.year
                        ? String(timelineMonths[0]?.year ?? "")
                        : `${timelineMonths[0]?.year ?? ""}–${timelineMonths.at(-1)?.year ?? ""}`}
                    </div>
                  </div>

                  <div
                    ref={timelineScrollRef}
                    onScroll={handleTimelineScroll}
                    className="min-h-0 flex-1 overflow-auto overscroll-contain"
                  >
                    <div className="flex min-h-full flex-col" style={{ minWidth: timelineMonths.length * TIMELINE_MONTH_WIDTH + 56 }}>
                      <div
                        className="sticky top-0 z-10 grid border-y border-zinc-200 bg-white/90 px-7 text-[0.68rem] uppercase tracking-[0.12em] text-zinc-400 backdrop-blur-sm"
                        style={{ gridTemplateColumns: timelineGridTemplate }}
                      >
                        {timelineMonths.map((month) => (
                          <div
                            key={month.key}
                            className="border-l border-zinc-200 px-4 py-3 first:border-l-0"
                          >
                            {month.label}
                          </div>
                        ))}
                      </div>

                      <div
                        className="relative flex-1"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(to right, transparent 0, transparent calc(180px - 1px), rgba(212,212,212,0.8) calc(180px - 1px), rgba(212,212,212,0.8) 180px)",
                          backgroundSize: `${TIMELINE_MONTH_WIDTH}px 100%`,
                        }}
                      >
                        <div className="min-h-full divide-y divide-zinc-200">
                      {activeTasks.length ? (
                        activeTasks.map((task) => {
                          const placement = getTaskGridPlacement(
                            task,
                            timelineRange.start,
                            timelineMonths.length
                          )
                          const data = taskData(task)
                          const summaryLines = renderActivitySummary(task)
                          const targetLine = formatActivityTarget(task)
                          const accentClass =
                            activityAccentClasses[task.type] ?? activityAccentClasses.activity
                          const topBorderClass =
                            activityTopBorderClasses[task.type] ?? activityTopBorderClasses.activity
                          const constantTask = isConstantTask(task)

                          return (
                            <div key={task.id} className="px-7 py-6">
                              <div className="grid gap-0" style={{ gridTemplateColumns: timelineGridTemplate }}>
                                <div
                                  style={{ gridColumn: `${placement.startCol} / span ${placement.span}` }}
                                  className={cn(
                                    "rounded-md border border-zinc-300 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
                                    accentClass
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "-mx-4 -mt-3 mb-2 rounded-t-md border-t-[3px] pt-3",
                                      topBorderClass
                                    )}
                                  ></div>
                                  {constantTask ? (
                                    <div className="sticky left-1/2 z-10 mx-auto flex w-[min(30rem,calc(100vw-5rem))] -translate-x-1/2 flex-col items-center py-2 text-center">
                                      <div className="text-[0.92rem] font-medium text-zinc-900">
                                        {task.name || "Untitled activity"}
                                      </div>
                                      <div className="mt-1 text-[0.72rem] text-zinc-500">
                                        {getActivityTypeLabel(task.type)} · {formatTaskTiming(task)}
                                      </div>

                                      {targetLine ? (
                                        <div className="mt-4 text-[0.82rem] text-zinc-700">
                                          <span className="font-semibold text-zinc-800">Target:</span>{" "}
                                          {targetLine.replace(/^Target:\s*/, "")}
                                        </div>
                                      ) : null}

                                      <div className="mt-4 text-[0.82rem] leading-6 text-zinc-700">
                                        <div className="font-semibold text-zinc-800">Details:</div>
                                        {summaryLines.length ? (
                                          summaryLines
                                            .filter((line) => !line.startsWith("Target: "))
                                            .map((line) => <div key={line}>{line}</div>)
                                        ) : (
                                          <div className="text-zinc-500">No activity details saved yet.</div>
                                        )}
                                      </div>

                                      {typeof data?.status === "string" && data.status.trim() ? (
                                        <div className="mt-3 text-[0.74rem] text-zinc-500">{data.status}</div>
                                      ) : null}

                                      <button
                                        type="button"
                                        onClick={() => openEditActivity(task)}
                                        className="mt-4 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.72rem] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                                      >
                                        <HugeiconsIcon icon={PencilEdit02Icon} size={14} />
                                        Edit
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-start justify-between gap-4">
                                        <div>
                                          <div className="text-[0.92rem] font-medium text-zinc-900">
                                            {task.name || "Untitled activity"}
                                          </div>
                                          <div className="mt-1 text-[0.72rem] text-zinc-500">
                                            {getActivityTypeLabel(task.type)} · {formatTaskTiming(task)}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => openEditActivity(task)}
                                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.72rem] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                                        >
                                          <HugeiconsIcon icon={PencilEdit02Icon} size={14} />
                                          Edit
                                        </button>
                                      </div>

                                      {targetLine ? (
                                        <div className="mt-4 text-[0.82rem] text-zinc-700">
                                          <span className="font-semibold text-zinc-800">Target:</span>{" "}
                                          {targetLine.replace(/^Target:\s*/, "")}
                                        </div>
                                      ) : null}

                                      <div className="mt-4 text-[0.82rem] leading-6 text-zinc-700">
                                        <div className="font-semibold text-zinc-800">Details:</div>
                                        {summaryLines.length ? (
                                          summaryLines
                                            .filter((line) => !line.startsWith("Target: "))
                                            .map((line) => <div key={line}>{line}</div>)
                                        ) : (
                                          <div className="text-zinc-500">No activity details saved yet.</div>
                                        )}
                                      </div>

                                      {typeof data?.status === "string" && data.status.trim() ? (
                                        <div className="mt-3 text-[0.74rem] text-zinc-500">{data.status}</div>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                          <div className="px-7 py-16 text-center text-sm text-zinc-500">
                            No activities in this plan yet. Use Create New + to add the first one.
                          </div>
                      )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center text-sm text-zinc-500">
                {planLoading ? "Loading management plan..." : "Management plan not found."}
              </div>
            )}
          </div>
        </div>

        <AlertDialog open={createActivityModalOpen && createActivityStep === 1} onOpenChange={handleCreateActivityModalOpenChange}>
          <AlertDialogContent
            size="lg"
            overlayClassName="bg-black/55"
            className="top-1/2 left-1/2 gap-0 rounded-2xl border border-zinc-200 p-0 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="p-7 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[1.05rem] text-zinc-500">
                      {isEditingActivity ? "Edit activity" : "Create new activity"}
                    </p>
                    <AlertDialogTitle className="mt-2 text-[2.1rem] font-medium leading-none text-zinc-950">
                      Basic information
                    </AlertDialogTitle>
                </div>

                <button
                  type="button"
                  onClick={() => handleCreateActivityModalOpenChange(false)}
                  className="inline-flex size-10 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-100"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={1.8} />
                </button>
              </div>

              <div className="mt-10">
                <div className="h-1 w-full rounded-full bg-zinc-200">
                  <div className="h-full w-1/3 rounded-full bg-[#4f7865]" />
                </div>
              </div>

              {createActivityError ? (
                <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {createActivityError}
                </div>
              ) : null}

              <AlertDialogDescription className="mt-8 text-[1rem] leading-7 text-zinc-700">
                {isEditingActivity
                  ? `Update the activity in ${activePlan?.name || "the current management plan"}.`
                  : `This activity will be added to ${activePlan?.name || "the current management plan"}.`}
              </AlertDialogDescription>

              <div className="mt-10 space-y-8">
                <div>
                  <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                    Activity Type
                  </label>
                  <Select
                    value={createActivityForm.activityType}
                    onValueChange={(value) => {
                      const nextType = value as TaskType
                      setCreateActivityForm((prev) => {
                        const timingMode = isConstantAreaActivityType(nextType)
                          ? "constant"
                          : prev.timingMode
                        return {
                          ...prev,
                          activityType: nextType,
                          timingMode,
                          startDate: timingMode === "constant" ? "" : prev.startDate,
                          endDate: timingMode === "constant" ? "" : prev.endDate,
                        }
                      })
                      setCreateActivityError(null)
                    }}
                  >
                    <SelectTrigger className="h-14 w-full rounded-2xl border-zinc-200 bg-white px-5 text-lg text-zinc-900">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activityTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                    Activity Name
                  </label>
                  <Input
                    value={createActivityForm.activityName}
                    onChange={(event) => {
                      updateActivityForm("activityName", event.target.value)
                      setCreateActivityError(null)
                    }}
                    placeholder="E.g. Cod fishing effort adjustment"
                    className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-zinc-400"
                  />
                </div>

                <div>
                  <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                    Target scope
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        value: "polygon",
                        label: "Selected area",
                        description: "Draw an activity polygon on the map.",
                      },
                      {
                        value: "wholeTile",
                        label: "Whole tile",
                        description: "Apply the activity to the full tile.",
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          updateActivityForm(
                            "targetScope",
                            option.value as CreateActivityFormState["targetScope"]
                          )
                        }
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-left transition-colors",
                          createActivityForm.targetScope === option.value
                            ? "border-[#4f7865] bg-[#eef5f0] text-zinc-950"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        )}
                      >
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className="mt-1 text-xs text-zinc-500">{option.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                    Timing
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        value: "scheduled",
                        label: "Scheduled",
                        description: "Uses start and end dates.",
                      },
                      {
                        value: "constant",
                        label: "Constant",
                        description: "Persistent area without dates.",
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          const timingMode = option.value as TaskTiming
                          setCreateActivityForm((prev) => ({
                            ...prev,
                            timingMode,
                            startDate: timingMode === "constant" ? "" : prev.startDate,
                            endDate: timingMode === "constant" ? "" : prev.endDate,
                          }))
                          setCreateActivityError(null)
                        }}
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-left transition-colors",
                          createActivityForm.timingMode === option.value
                            ? "border-[#4f7865] bg-[#eef5f0] text-zinc-950"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        )}
                      >
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className="mt-1 text-xs text-zinc-500">{option.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {createActivityForm.timingMode === "scheduled" ? (
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                        Start Date
                      </label>
                      <Input
                        type="date"
                        value={createActivityForm.startDate}
                        onChange={(event) => updateActivityForm("startDate", event.target.value)}
                        className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg"
                      />
                    </div>

                    <div>
                      <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                        End Date
                      </label>
                      <Input
                        type="date"
                        value={createActivityForm.endDate}
                        onChange={(event) => updateActivityForm("endDate", event.target.value)}
                        className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-14 flex items-center justify-between gap-4">
                <AlertDialogCancel className="h-auto border-0 bg-transparent px-0 text-[1.1rem] font-medium text-zinc-700 shadow-none hover:bg-transparent hover:text-zinc-950">
                  Cancel
                </AlertDialogCancel>

                <Button
                  type="button"
                  onClick={handleActivityStepOneNext}
                  className="h-14 rounded-2xl bg-[#4f7865] px-7 text-[1.05rem] font-medium text-white hover:bg-[#456b5a]"
                >
                  {createActivityForm.targetScope === "wholeTile"
                    ? "Next: Details"
                    : isEditingActivity
                      ? "Next: Edit Area"
                      : "Next: Select Area"}
                </Button>
              </div>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {createActivityModalOpen && createActivityStep === 2 ? (
          <div className="fixed top-[calc(var(--spacing-pane)*2+4.5rem)] right-6 z-50 w-[min(36rem,calc(50vw-2.5rem))] pointer-events-auto">
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-xl">
              <div className="p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[1rem] text-zinc-500">Select Activity Area</p>
                    <h2 className="mt-2 text-[2rem] font-medium leading-none text-zinc-950">
                      Map selection
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCreateActivityModalOpenChange(false)}
                    className="inline-flex size-10 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-100"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={1.8} />
                  </button>
                </div>

                <div className="mt-8">
                  <div className="h-1 w-full rounded-full bg-zinc-200">
                    <div className="h-full w-2/3 rounded-full bg-[#4f7865]" />
                  </div>
                </div>

                <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                  {isEditingExistingArea
                    ? "This activity already has an area. Keep it as-is, adjust the current outline, or redraw it from scratch."
                    : "Click directly on the map to place vertices for this activity area. Use at least three points, then click the first point again or press Finish shape to close the polygon."}
                </div>

                {isEditingExistingArea ? (
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      onClick={handleAdjustExistingActivityArea}
                      className="h-11 rounded-2xl bg-[#4f7865] px-5 text-sm font-medium text-white hover:bg-[#456b5a]"
                    >
                      Adjust existing outline
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRedrawActivityArea}
                      className="h-11 rounded-2xl border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                    >
                      Redraw from scratch
                    </Button>
                  </div>
                ) : null}

                <div className="mt-8 rounded-2xl border border-zinc-300 bg-white px-4 py-3">
                  <div className="text-[1rem] font-medium text-zinc-950">Selected Area</div>
                  <div className="mt-4 space-y-2 text-[0.95rem] text-zinc-600">
                    <div className="flex items-center justify-between gap-6">
                      <span>Activity</span>
                      <span className="text-zinc-900">
                        {createActivityForm.activityName.trim() || "Untitled activity"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>Area size</span>
                      <span className="text-zinc-900">
                        {formatAreaKm2(selectedAreaSummary?.areaKm2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>Vertices</span>
                      <span className="text-zinc-900">
                        {selectedAreaSummary?.vertexCount ?? getActivityAreaVertexCount(areaPoints)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>Status</span>
                      <span className="text-zinc-900">
                        {isSelectedAreaClosed ? "Closed polygon" : "Open path"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>Center</span>
                      <span className="text-right text-zinc-900">
                        {selectedAreaSummary
                          ? `${formatCoordinate(selectedAreaSummary.centroid.lat, "lat")}, ${formatCoordinate(selectedAreaSummary.centroid.lng, "lng")}`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>Bounds</span>
                      <span className="text-right text-zinc-900">
                        {selectedAreaSummary
                          ? `${formatCoordinate(selectedAreaSummary.bbox.minLat, "lat")} to ${formatCoordinate(selectedAreaSummary.bbox.maxLat, "lat")}`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {!hasValidSelectedArea ? (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                    {activityAreaStepMode === "draw"
                      ? "Current selection is incomplete. Add at least three points on the map."
                      : "No existing area is available yet. Choose Redraw from scratch to create one on the map."}
                  </div>
                ) : null}

                <div className="mt-10 flex items-center justify-between gap-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setCreateActivityError(null)
                      setActivityAreaStepMode("draw")
                      setCreateActivityStep(1)
                    }}
                    className="h-auto px-0 text-[1.1rem] font-medium text-zinc-700 hover:bg-transparent hover:text-zinc-950"
                  >
                    Back
                  </Button>

                  <Button
                    type="button"
                    disabled={!hasValidSelectedArea}
                    onClick={handleActivityStepTwoNext}
                    className="h-12 rounded-2xl bg-[#4f7865] px-7 text-[1.05rem] font-medium text-white hover:bg-[#456b5a]"
                  >
                    Next: Details
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {createActivityModalOpen && createActivityStep === 3 ? (
          <div className="pointer-events-auto fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px]">
            <div className="flex h-full items-start justify-center px-6 pb-6 pt-[calc(var(--spacing-pane)*2+4.5rem)]">
              <div className="my-6 flex max-h-[calc(100vh-7rem)] w-[min(96rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
                <div className="min-h-0 flex-1 overflow-y-auto p-7 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[1.05rem] text-zinc-500">Activity Details</p>
                      <h2 className="mt-2 text-[2.1rem] font-medium leading-none text-zinc-950">
                        Parameters &amp; impacts
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCreateActivityModalOpenChange(false)}
                      className="inline-flex size-10 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-100"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={1.8} />
                    </button>
                  </div>

                  <div className="mt-10">
                    <div className="h-1 w-full rounded-full bg-zinc-200">
                      <div className="h-full w-full rounded-full bg-[#4f7865]" />
                    </div>
                  </div>

                  {createActivityError ? (
                    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {createActivityError}
                    </div>
                  ) : null}

                  <div className="mt-10 grid gap-x-8 gap-y-10 lg:grid-cols-2">
                    <div>
                      <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                        Target / Objective
                      </label>
                      <Input
                        value={createActivityForm.objective}
                        onChange={(event) => updateActivityForm("objective", event.target.value)}
                        placeholder="E.g. reduce fishing pressure on cod"
                        className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-zinc-400"
                      />
                    </div>

                    <div>
                      <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                        Description
                      </label>
                      <Textarea
                        value={createActivityForm.description}
                        onChange={(event) => updateActivityForm("description", event.target.value)}
                        placeholder="Describe the activity..."
                        className="min-h-36 rounded-2xl border-zinc-200 bg-white px-5 py-4 text-lg placeholder:text-slate-400"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <div className="text-[1rem] font-medium text-zinc-950">Financial</div>
                      <div className="mt-4 grid gap-8 lg:grid-cols-2">
                        <div>
                          <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                            Cost (SEK)
                          </label>
                          <Input
                            value={createActivityForm.cost}
                            onChange={(event) => updateActivityForm("cost", event.target.value)}
                            inputMode="decimal"
                            placeholder="0"
                            className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-slate-400"
                          />
                        </div>

                        <div>
                          <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                            Revenue (SEK)
                          </label>
                          <Input
                            value={createActivityForm.revenue}
                            onChange={(event) => updateActivityForm("revenue", event.target.value)}
                            inputMode="decimal"
                            placeholder="0.0"
                            className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                    </div>

                    {createActivityForm.activityType === "fishing" ? (
                      <div className="lg:col-span-2">
                        <div className="text-[1rem] font-medium text-zinc-950">
                          Fishing effort multipliers
                        </div>
                        <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                          {marineSpecies.map((species) => (
                            <div key={species.id}>
                              <label className="mb-2 block text-sm font-medium text-zinc-800">
                                {species.label}
                              </label>
                              <Input
                                value={createActivityForm.speciesEffortMultipliers[species.id] ?? "1.0"}
                                onChange={(event) =>
                                  setCreateActivityForm((prev) => ({
                                    ...prev,
                                    speciesEffortMultipliers: {
                                      ...prev.speciesEffortMultipliers,
                                      [species.id]: event.target.value,
                                    },
                                  }))
                                }
                                inputMode="decimal"
                                placeholder="1.0"
                                className="h-12 rounded-2xl border-zinc-200 bg-white px-5 text-base placeholder:text-slate-400"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {createActivityForm.activityType === "construction" ? (
                      <div className="lg:col-span-2">
                        <div className="text-[1rem] font-medium text-zinc-950">
                          Construction parameters
                        </div>
                        <div className="mt-5 grid gap-6 lg:grid-cols-2">
                          <div>
                            <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                              Category
                            </label>
                            <Select
                              value={createActivityForm.constructionCategory}
                              onValueChange={(value) =>
                                updateActivityForm("constructionCategory", value)
                              }
                            >
                              <SelectTrigger className="h-14 w-full rounded-2xl border-zinc-200 bg-white px-5 text-lg text-zinc-900">
                                <SelectValue placeholder="Select category..." />
                              </SelectTrigger>
                              <SelectContent>
                                {constructionCategories.map((category) => (
                                  <SelectItem key={category.id} value={category.id}>
                                    {category.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                              Intensity
                            </label>
                            <Input
                              value={createActivityForm.constructionIntensity}
                              onChange={(event) =>
                                updateActivityForm("constructionIntensity", event.target.value)
                              }
                              inputMode="decimal"
                              placeholder="0"
                              className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-slate-400"
                            />
                          </div>
                          <div className="lg:col-span-2">
                            <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                              Construction description
                            </label>
                            <Textarea
                              value={createActivityForm.constructionDescription}
                              onChange={(event) =>
                                updateActivityForm("constructionDescription", event.target.value)
                              }
                              placeholder="Describe the construction pressure or mitigation context..."
                              className="min-h-28 rounded-2xl border-zinc-200 bg-white px-5 py-4 text-lg placeholder:text-slate-400"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-8 border-t border-zinc-200 bg-white px-7 py-6 sm:px-8">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setCreateActivityError(null)
                      setCreateActivityStep(createActivityForm.targetScope === "wholeTile" ? 1 : 2)
                    }}
                    className="h-auto px-0 text-[1.1rem] font-medium text-zinc-700 hover:bg-transparent hover:text-zinc-950"
                  >
                    Back
                  </Button>

                  <Button
                    type="button"
                    disabled={isCreatingActivity}
                    onClick={() => void handleSubmitActivity()}
                    className="h-14 rounded-2xl bg-[#4f7865] px-10 text-[1.2rem] font-medium text-white hover:bg-[#456b5a]"
                  >
                    {isCreatingActivity
                      ? isEditingActivity
                        ? "Saving..."
                        : "Creating..."
                      : isEditingActivity
                        ? "Save Changes"
                        : "Create Activity"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <section className="absolute inset-x-0 bottom-0 top-[4.5rem] z-30 p-pane">
      <div className="h-full w-full rounded-pane bg-[#f5f5f2] p-6 sm:p-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[2rem] font-medium tracking-[-0.02em] text-zinc-950">
                Management plans
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {filteredLocation
                  ? `Showing plans for ${filteredLocation.name?.trim() || "the selected location"}.`
                  : "Create a plan for a location first, then add one or more activities inside it."}
              </p>
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
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Activities</th>
                    <th className="px-4 py-3 font-medium">Start date</th>
                    <th className="px-4 py-3 font-medium">End date</th>
                    <th className="px-4 py-3 font-medium">Cost (SEK)</th>
                    <th className="px-4 py-3 font-medium">Revenue (SEK)</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlans.length ? (
                    filteredPlans.map((plan) => {
                      const row = toPlanRow(plan)
                      return (
                      <tr key={row.id} className="border-b border-zinc-200 last:border-b-0">
                        <td className="px-4 py-5 align-top text-sm leading-5 text-zinc-700">
                          <span className="block max-w-[14rem] whitespace-normal font-medium text-zinc-900">
                            {row.name}
                          </span>
                        </td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">
                          {row.locationName}
                        </td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.activityCount}</td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.startDate}</td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.endDate}</td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.costLabel}</td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.revenueLabel}</td>
                        <td className="px-4 py-5 align-top text-sm text-zinc-600">{row.statusLabel}</td>
                        <td className="px-4 py-5 align-top text-sm">
                          <button
                            type="button"
                            onClick={() => navigate(`/management-plans/${row.id}`)}
                            className="text-zinc-600 transition-colors hover:text-zinc-950"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    )})
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-zinc-500">
                        {loading
                          ? "Loading plans..."
                          : filteredLocation
                            ? "No management plans found for this location."
                            : "No management plans found."}
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
              onClick={() => handleCreatePlanModalOpenChange(true)}
              className="h-9 rounded-lg bg-black px-4 text-sm font-medium text-white hover:bg-black/90"
            >
              Create New +
            </Button>
            {filteredLocation ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/management-plans")}
                className="h-9 rounded-lg border-zinc-300 bg-transparent px-4 text-sm font-medium text-zinc-700 hover:bg-white"
              >
                Clear location filter
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <AlertDialog open={createPlanModalOpen} onOpenChange={handleCreatePlanModalOpenChange}>
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
                  Create plan
                </AlertDialogTitle>
              </div>

              <button
                type="button"
                onClick={() => handleCreatePlanModalOpenChange(false)}
                className="inline-flex size-10 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-100"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={1.8} />
              </button>
            </div>

            <AlertDialogDescription className="mt-10 text-[1rem] leading-7 text-zinc-700">
              A management plan is tied to a single location and acts as the container for one or
              more activities. After creation you will be taken directly to the timeline view for
              that plan.
            </AlertDialogDescription>

            {createPlanError ? (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {createPlanError}
              </div>
            ) : null}

            <div className="mt-10">
              <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                Plan Name
              </label>
              <Input
                value={createPlanForm.name}
                onChange={(event) => {
                  setCreatePlanForm((prev) => ({ ...prev, name: event.target.value }))
                  setCreatePlanError(null)
                }}
                placeholder="E.g. 2026 regional habitat programme"
                className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-zinc-400"
              />
            </div>

            <div className="mt-8">
              <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                Location
              </label>
              <Select
                value={createPlanForm.tileId}
                onValueChange={(value) => {
                  setCreatePlanForm((prev) => ({ ...prev, tileId: value }))
                  setCreatePlanError(null)
                }}
              >
                <SelectTrigger className="h-14 w-full rounded-2xl border-zinc-200 bg-white px-5 text-lg text-zinc-900">
                  <SelectValue
                    placeholder={
                      tilesLoading && !locationOptions.length
                        ? "Loading locations..."
                        : "Select location..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((tile: Tile) => (
                    <SelectItem key={tile.id} value={tile.id}>
                      {tile.name?.trim() || "Untitled location"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-14 flex items-center justify-between gap-4">
              <AlertDialogCancel className="h-auto border-0 bg-transparent px-0 text-[1.1rem] font-medium text-zinc-700 shadow-none hover:bg-transparent hover:text-zinc-950">
                Cancel
              </AlertDialogCancel>

              <Button
                type="button"
                disabled={isCreatingPlan}
                onClick={() => void handleCreatePlan()}
                className="h-14 rounded-2xl bg-[#4f7865] px-7 text-[1.05rem] font-medium text-white hover:bg-[#456b5a]"
              >
                {isCreatingPlan ? "Creating..." : "Create Plan"}
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
