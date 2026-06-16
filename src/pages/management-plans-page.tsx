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
import { getManagementPlanDateRange } from "@/lib/management-plan-dates"
import { t, tc } from "@/lib/translations"
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
  if (isConstantTask(task)) return t("common.constant")
  return `${formatDate(task.start)} to ${formatDate(task.end)}`
}

function planLocationName(plan?: ManagementPlan | null) {
  const expandedTile = plan?.expand?.tile
  if (expandedTile?.name?.trim()) return expandedTile.name.trim()
  if (plan?.tile) return t("common.untitledLocation")
  return t("managementPlans.noLocation")
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

function extractTaskActivityAreas(data?: TaskData): ActivityAreaPoint[][] {
  const areas = Array.isArray(data?.areas)
    ? data.areas
        .map((areaItem) => extractActivityAreaPoints(areaItem?.area))
        .filter((points) => points.length >= 3)
    : []

  if (areas.length) return areas

  const legacyArea = extractActivityAreaPoints(data?.area)
  return legacyArea.length >= 3 ? [legacyArea] : []
}

function buildActivityAreaEntries(areas: ActivityAreaPoint[][]) {
  return areas
    .map((points) => {
      const area = toActivityAreaGeometry(points)
      const areaSummary = summarizeActivityArea(points)
      if (!area || !areaSummary) return null
      return { area, areaSummary }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

function summarizeActivityAreas(areas: ActivityAreaPoint[][]) {
  const summaries = areas
    .map((points) => summarizeActivityArea(points))
    .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary))

  if (!summaries.length) return null

  const first = summaries[0]
  const totalAreaKm2 = summaries.reduce((sum, summary) => sum + summary.areaKm2, 0)

  return {
    ...first,
    areaKm2: totalAreaKm2,
    areaCount: summaries.length,
  }
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
        : data?.area || (Array.isArray(data?.areas) && data.areas.length)
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
  const range = getManagementPlanDateRange(tasks)
  if (range) {
    return {
      startDate: range.startDate,
      endDate: range.endDate,
    }
  }

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
      startDate: t("common.constant"),
      endDate: t("common.constant"),
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
    name: plan.name?.trim() || t("common.untitledPlan"),
    locationName: planLocationName(plan),
    activityCount: tasks.length,
    startDate,
    endDate,
    costLabel: formatCurrency(totalCost),
    revenueLabel: formatCurrency(totalRevenue),
    statusLabel: tasks.length ? tc("managementPlans.activityCount", "managementPlans.activityCountPlural", tasks.length) : t("managementPlans.emptyPlan"),
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
              ? t("managementPlans.effortMultiplier", { species: species.label, value })
              : null
          })
          .filter((value): value is string => Boolean(value))
      : []
  const constructionLines =
    task.type === "construction" && data?.construction
      ? [
          data.construction.category
            ? `${t("managementPlans.category")}: ${getConstructionCategoryLabel(data.construction.category)}`
            : null,
          typeof data.construction.intensity === "number"
            ? `${t("managementPlans.intensity")}: ${data.construction.intensity}`
            : null,
          data.construction.description ? t("managementPlans.constructionPrefix", { description: data.construction.description }) : null,
        ].filter((value): value is string => Boolean(value))
      : []
  const lines = [
    t("managementPlans.typePrefix", { type: getActivityTypeLabel(task.type) }),
    t("managementPlans.timingPrefix", { timing: formatTaskTiming(task) }),
    data?.objective ? t("managementPlans.targetPrefix", { target: data.objective }) : null,
    data?.description ? t("managementPlans.detailsPrefix", { details: data.description }) : null,
    data?.targetScope === "wholeTile" ? `${t("common.area")}: ${t("common.wholeTile")}` : null,
    ...multiplierLines,
    ...constructionLines,
    typeof data?.cost === "number" ? t("managementPlans.costPrefix", { cost: formatCurrency(data.cost) }) : null,
    typeof data?.revenue === "number" ? t("managementPlans.revenuePrefix", { revenue: formatCurrency(data.revenue) }) : null,
  ].filter((value): value is string => Boolean(value))

  return lines.slice(0, 7)
}

function formatActivityTarget(task: Task) {
  const objective = taskData(task)?.objective
  return objective ? t("managementPlans.targetPrefix", { target: objective }) : null
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
  const [completedActivityAreas, setCompletedActivityAreas] = useState<ActivityAreaPoint[][]>([])
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
        (left.name?.trim() || t("common.untitledLocation")).localeCompare(
          right.name?.trim() || t("common.untitledLocation")
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
  const hasValidSelectedArea = useMemo(() => isValidActivityArea(areaPoints), [areaPoints])
  const allSelectedActivityAreas = useMemo(() => {
    const areas = [...completedActivityAreas]
    if (hasValidSelectedArea) areas.push(areaPoints)
    return areas
  }, [areaPoints, completedActivityAreas, hasValidSelectedArea])
  const selectedAreaSummary = useMemo(() => summarizeActivityArea(areaPoints), [areaPoints])
  const selectedAreasSummary = useMemo(
    () => summarizeActivityAreas(allSelectedActivityAreas),
    [allSelectedActivityAreas]
  )
  const hasAnyValidSelectedArea = allSelectedActivityAreas.length > 0
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
      setCreatePlanError(t("managementPlans.enterManagementPlanName"))
      return
    }
    if (!createPlanForm.tileId) {
      setCreatePlanError(t("managementPlans.choosePlanLocation"))
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
      setCreatePlanError(t("managementPlans.failedToCreatePlan", { message: toMessage(err) }))
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
    setCompletedActivityAreas([])
    setAreaHoverPoint(null)
    setAreaDrawingActive(false)
  }

  function handleCreateActivityModalOpenChange(nextOpen: boolean) {
    setCreateActivityModalOpen(nextOpen)
    if (!nextOpen) resetCreateActivityState()
  }

  function openEditActivity(task: Task) {
    const existingAreas = extractTaskActivityAreas(taskData(task))
    const [existingAreaPoints = [], ...otherAreas] = existingAreas
    setEditingTaskId(task.id)
    setCreateActivityForm(createActivityFormFromTask(task))
    setCreateActivityStep(1)
    setActivityAreaStepMode(existingAreaPoints.length >= 3 ? "review" : "draw")
    setCreateActivityError(null)
    setIsCreatingActivity(false)
    setAreaPoints(existingAreaPoints)
    setCompletedActivityAreas(otherAreas)
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
      setCreateActivityError(t("managementPlans.chooseActivityType"))
      return
    }

    if (!createActivityForm.activityName.trim()) {
      setCreateActivityError(t("managementPlans.enterActivityName"))
      return
    }

    if (createActivityForm.timingMode === "scheduled") {
      if (!createActivityForm.startDate || !createActivityForm.endDate) {
        setCreateActivityError(t("managementPlans.setStartAndEndDate"))
        return
      }
      if (createActivityForm.endDate < createActivityForm.startDate) {
        setCreateActivityError(t("managementPlans.setEndDateAfterStart"))
        return
      }
    }

    if (createActivityForm.targetScope === "wholeTile") {
      setCreateActivityError(null)
      setAreaPoints([])
      setCompletedActivityAreas([])
      setAreaHoverPoint(null)
      setActivityAreaStepMode("draw")
      setCreateActivityStep(3)
      return
    }

    const existingAreas = editingTask ? extractTaskActivityAreas(taskData(editingTask)) : []
    const [existingAreaPoints = [], ...otherAreas] = existingAreas
    setCreateActivityError(null)
    setAreaPoints((prev) => {
      if (prev.length) return prev
      return existingAreaPoints
    })
    setCompletedActivityAreas((prev) => (prev.length ? prev : otherAreas))
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
    setCompletedActivityAreas([])
    setAreaHoverPoint(null)
  }

  function handleCloseActivityArea() {
    if (!hasValidSelectedArea) return
    setAreaPoints((prev) => closeActivityAreaPoints(prev))
    setAreaHoverPoint(null)
  }

  function handleActivityStepTwoNext() {
    if (!hasAnyValidSelectedArea) {
      setCreateActivityError(t("managementPlans.drawActivityAreaBeforeContinue"))
      return
    }

    setCreateActivityError(null)
    setAreaPoints((prev) => closeActivityAreaPoints(prev))
    setAreaHoverPoint(null)
    setCreateActivityStep(3)
  }

  function handleAddAnotherActivityArea() {
    if (!hasValidSelectedArea) {
      setCreateActivityError(t("managementPlans.drawActivityAreaBeforeAdd"))
      return
    }

    setCompletedActivityAreas((prev) => [...prev, closeActivityAreaPoints(areaPoints)])
    setAreaPoints([])
    setAreaHoverPoint(null)
    setActivityAreaStepMode("draw")
    setCreateActivityError(null)
  }

  async function handleSubmitActivity() {
    if (!activePlan) {
      setCreateActivityError(t("managementPlans.noActivePlan"))
      return
    }

    const activityName = createActivityForm.activityName.trim()
    if (!createActivityForm.activityType) {
      setCreateActivityError(t("managementPlans.chooseActivityTypeBeforeCreate"))
      setCreateActivityStep(1)
      return
    }
    if (!activityName) {
      setCreateActivityError(t("managementPlans.enterActivityNameBeforeCreate"))
      setCreateActivityStep(1)
      return
    }
    if (createActivityForm.timingMode === "scheduled") {
      if (!createActivityForm.startDate || !createActivityForm.endDate) {
        setCreateActivityError(t("managementPlans.setStartAndEndDate"))
        setCreateActivityStep(1)
        return
      }
      if (createActivityForm.endDate < createActivityForm.startDate) {
        setCreateActivityError(t("managementPlans.setEndDateAfterStart"))
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
      const activityAreaEntries = buildActivityAreaEntries(allSelectedActivityAreas)
      if (!activityAreaEntries.length) {
        setCreateActivityError(t("managementPlans.drawActivityAreaBeforeCreate"))
        setCreateActivityStep(2)
        setAreaDrawingActive(true)
        return
      }

      data.areas = activityAreaEntries
      data.area = activityAreaEntries[0].area
      data.areaSummary = summarizeActivityAreas(allSelectedActivityAreas) ?? activityAreaEntries[0].areaSummary
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
          setCreateActivityError(t("managementPlans.enterNonNegativeEffortMultiplier", { species: species.label }))
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
        setCreateActivityError(t("managementPlans.chooseConstructionCategory"))
        setCreateActivityStep(3)
        return
      }
      if (intensity === undefined || intensity < 0) {
        setCreateActivityError(t("managementPlans.enterNonNegativeConstructionIntensity"))
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
                    {t("managementPlans.clear")}
                  </Button>
                </div>
              ) : createActivityModalOpen && createActivityStep === 2 ? (
                <div className="flex items-center gap-5 text-[0.72rem]">
                  <div className="rounded-md bg-[#3f5a50] px-3 py-2 font-medium text-white">
                    {t("managementPlans.existingAreaLoaded")}
                  </div>
                  <span className="text-white/75">
                    {t("managementPlans.reviewExistingArea")}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-5 text-[0.72rem]">
                  <div className="flex items-center gap-2">
                    <div className="grid size-6 place-items-center rounded-md bg-[#3f5a50]">
                      <span className="text-[0.7rem]">⌖</span>
                    </div>
                    <span>{t("common.activities")}</span>
                  </div>
                  <span className="opacity-70">{t("managementPlans.totalActivities", { count: activeTasks.length })}</span>
                  <span className="opacity-70">{t("managementPlans.selectActivity")}</span>
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
                      {t("managementPlans.createNew")}
                    </Button>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <div className="text-[0.72rem] uppercase tracking-[0.2em] text-zinc-400">
                        {activePlan.name || t("common.untitledPlan")}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {t("common.location")}: {planLocationName(activePlan)}
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
                    <div className="flex min-h-full flex-col" style={{ minWidth: timelineMonths.length * TIMELINE_MONTH_WIDTH + 40 }}>
                      <div
                        className="sticky top-0 z-10 grid border-y border-zinc-200 bg-white/90 px-5 text-[0.62rem] uppercase tracking-[0.12em] text-zinc-400 backdrop-blur-sm"
                        style={{ gridTemplateColumns: timelineGridTemplate }}
                      >
                        {timelineMonths.map((month) => (
                          <div
                            key={month.key}
                            className="border-l border-zinc-200 px-3 py-2 first:border-l-0"
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
                          const constantTask = isConstantTask(task)
                          const statusLine =
                            typeof data?.status === "string" && data.status.trim()
                              ? data.status.trim()
                              : null
                          const typePrefix = t("managementPlans.typePrefix", { type: "" })
                          const timingPrefix = t("managementPlans.timingPrefix", { timing: "" })
                          const targetPrefix = t("managementPlans.targetPrefix", { target: "" })
                          const detailLines = summaryLines.filter(
                            (line) =>
                              !line.startsWith(typePrefix) &&
                              !line.startsWith(timingPrefix) &&
                              !line.startsWith(targetPrefix)
                          )
                          const compactLines = [
                            targetLine?.slice(targetPrefix.length).trim(),
                            ...detailLines,
                          ].filter((line): line is string => Boolean(line))

                          return (
                            <div key={task.id} className="px-5 py-2">
                              <div className="grid gap-0" style={{ gridTemplateColumns: timelineGridTemplate }}>
                                <div
                                  style={{ gridColumn: `${placement.startCol} / span ${placement.span}` }}
                                  className={cn(
                                    "overflow-visible rounded-sm border border-l-4 border-zinc-300 bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                                    accentClass
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "flex items-center gap-2",
                                      constantTask
                                        ? "sticky left-4 z-10 w-[min(42rem,calc(100vw-5rem))]"
                                        : ""
                                    )}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <div className="truncate text-[0.78rem] font-semibold leading-4 text-zinc-900">
                                          {task.name || t("common.untitledActivity")}
                                        </div>
                                        <span className="shrink-0 rounded-sm bg-white/70 px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-zinc-600 ring-1 ring-black/5">
                                          {getActivityTypeLabel(task.type)}
                                        </span>
                                        {constantTask ? (
                                          <span className="shrink-0 rounded-sm bg-zinc-900 px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-white">
                                            {t("common.constant")}
                                          </span>
                                        ) : null}
                                      </div>

                                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem] leading-4 text-zinc-600">
                                        <span className="shrink-0 font-medium text-zinc-700">
                                          {formatTaskTiming(task)}
                                        </span>
                                        {compactLines.slice(0, 3).map((line) => (
                                          <span key={line} className="max-w-[18rem] truncate">
                                            {line}
                                          </span>
                                        ))}
                                        {statusLine ? (
                                          <span className="shrink-0 text-zinc-500">
                                            {statusLine}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => openEditActivity(task)}
                                      title={t("managementPlans.editActivityNamed", { name: task.name || t("common.activity") })}
                                      aria-label={t("managementPlans.editActivityNamed", { name: task.name || t("common.activity") })}
                                      className="sticky right-2 z-20 inline-flex size-6 shrink-0 items-center justify-center self-start rounded-sm bg-white/85 text-zinc-500 shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white hover:text-zinc-950"
                                    >
                                      <HugeiconsIcon icon={PencilEdit02Icon} size={12} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                          <div className="px-7 py-16 text-center text-sm text-zinc-500">
                            {t("managementPlans.noActivitiesInPlan")}
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
                {planLoading ? t("managementPlans.loadingPlan") : t("managementPlans.planNotFound")}
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
                      {isEditingActivity ? t("managementPlans.editActivity") : t("managementPlans.createNewActivity")}
                    </p>
                    <AlertDialogTitle className="mt-2 text-[2.1rem] font-medium leading-none text-zinc-950">
                      {t("managementPlans.basicInformation")}
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
                  ? t("managementPlans.editActivityInPlan", { plan: activePlan?.name || t("managementPlans.currentPlan") })
                  : t("managementPlans.addActivityToPlan", { plan: activePlan?.name || t("managementPlans.currentPlan") })}
              </AlertDialogDescription>

              <div className="mt-10 space-y-8">
                <div>
                  <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                    {t("managementPlans.activityType")}
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
                      <SelectValue placeholder={t("managementPlans.selectType")} />
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
                    {t("managementPlans.activityName")}
                  </label>
                  <Input
                    value={createActivityForm.activityName}
                    onChange={(event) => {
                      updateActivityForm("activityName", event.target.value)
                      setCreateActivityError(null)
                    }}
                    placeholder={t("managementPlans.activityNamePlaceholder")}
                    className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-zinc-400"
                  />
                </div>

                <div>
                  <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                    {t("managementPlans.targetScope")}
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        value: "polygon",
                        label: t("managementPlans.selectedArea"),
                        description: t("managementPlans.selectedAreaDescription"),
                      },
                      {
                        value: "wholeTile",
                        label: t("common.wholeTile"),
                        description: t("managementPlans.wholeTileDescription"),
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
                    {t("common.timeline")}
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        value: "scheduled",
                        label: t("common.scheduled"),
                        description: t("managementPlans.scheduledDescription"),
                      },
                      {
                        value: "constant",
                        label: t("common.constant"),
                        description: t("managementPlans.constantDescription"),
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
                        {t("common.startDate")}
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
                        {t("common.endDate")}
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
                  {t("common.cancel")}
                </AlertDialogCancel>

                <Button
                  type="button"
                  onClick={handleActivityStepOneNext}
                  className="h-14 rounded-2xl bg-[#4f7865] px-7 text-[1.05rem] font-medium text-white hover:bg-[#456b5a]"
                >
                  {createActivityForm.targetScope === "wholeTile"
                    ? t("managementPlans.nextDetails")
                    : isEditingActivity
                      ? t("managementPlans.nextEditArea")
                      : t("managementPlans.nextSelectArea")}
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
                    <p className="text-[1rem] text-zinc-500">{t("managementPlans.selectActivityArea")}</p>
                    <h2 className="mt-2 text-[2rem] font-medium leading-none text-zinc-950">
                      {t("managementPlans.mapSelection")}
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
                    ? t("managementPlans.existingAreaInstructions")
                    : t("managementPlans.selectActivityAreaInstructions")}
                </div>

                {isEditingExistingArea ? (
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      onClick={handleAdjustExistingActivityArea}
                      className="h-11 rounded-2xl bg-[#4f7865] px-5 text-sm font-medium text-white hover:bg-[#456b5a]"
                    >
                      {t("managementPlans.adjustExistingOutline")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRedrawActivityArea}
                      className="h-11 rounded-2xl border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                    >
                      {t("managementPlans.redrawFromScratch")}
                    </Button>
                  </div>
                ) : null}

                <div className="mt-8 rounded-2xl border border-zinc-300 bg-white px-4 py-3">
                  <div className="text-[1rem] font-medium text-zinc-950">{t("managementPlans.selectedAreaTitle")}</div>
                  <div className="mt-4 space-y-2 text-[0.95rem] text-zinc-600">
                    <div className="flex items-center justify-between gap-6">
                      <span>{t("common.activity")}</span>
                      <span className="text-zinc-900">
                        {createActivityForm.activityName.trim() || t("common.untitledActivity")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>{t("common.areas")}</span>
                      <span className="text-zinc-900">{allSelectedActivityAreas.length}</span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>{t("common.areaSize")}</span>
                      <span className="text-zinc-900">
                        {formatAreaKm2(selectedAreasSummary?.areaKm2 ?? selectedAreaSummary?.areaKm2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>{t("common.vertices")}</span>
                      <span className="text-zinc-900">
                        {selectedAreaSummary?.vertexCount ?? getActivityAreaVertexCount(areaPoints)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>{t("common.status")}</span>
                      <span className="text-zinc-900">
                        {isSelectedAreaClosed ? t("managementPlans.closedPolygon") : t("common.openPath")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>{t("common.center")}</span>
                      <span className="text-right text-zinc-900">
                        {selectedAreaSummary
                          ? `${formatCoordinate(selectedAreaSummary.centroid.lat, "lat")}, ${formatCoordinate(selectedAreaSummary.centroid.lng, "lng")}`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span>{t("common.bounds")}</span>
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
                      ? completedActivityAreas.length
                        ? t("managementPlans.incompleteArea")
                        : t("managementPlans.incompleteCurrentArea")
                      : t("managementPlans.noExistingArea")}
                  </div>
                ) : null}

                {completedActivityAreas.length ? (
                  <div className="mt-4 space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                    {completedActivityAreas.map((points, index) => {
                      const summary = summarizeActivityArea(points)
                      return (
                        <div key={`${index}-${points.length}`} className="flex items-center justify-between gap-4">
                          <span>
                            {t("managementPlans.areaSummary", { index: index + 1, area: formatAreaKm2(summary?.areaKm2) })}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCompletedActivityAreas((prev) =>
                                prev.filter((_, areaIndex) => areaIndex !== index)
                              )
                            }
                            className="text-zinc-500 transition-colors hover:text-zinc-950"
                          >
                            {t("managementPlans.remove")}
                          </button>
                        </div>
                      )
                    })}
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
                    {t("common.back")}
                  </Button>

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!hasValidSelectedArea}
                      onClick={handleAddAnotherActivityArea}
                      className="h-12 rounded-2xl border-zinc-300 bg-white px-5 text-[0.95rem] font-medium text-zinc-900 hover:bg-zinc-50"
                    >
                      {t("managementPlans.addAnotherArea")}
                    </Button>
                    <Button
                      type="button"
                      disabled={!hasAnyValidSelectedArea}
                      onClick={handleActivityStepTwoNext}
                      className="h-12 rounded-2xl bg-[#4f7865] px-7 text-[1.05rem] font-medium text-white hover:bg-[#456b5a]"
                    >
                      {t("managementPlans.nextDetails")}
                    </Button>
                  </div>
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
                      <p className="text-[1.05rem] text-zinc-500">{t("managementPlans.activityDetails")}</p>
                      <h2 className="mt-2 text-[2.1rem] font-medium leading-none text-zinc-950">
                        {t("managementPlans.parametersImpacts")}
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
                        {t("managementPlans.targetObjective")}
                      </label>
                      <Input
                        value={createActivityForm.objective}
                        onChange={(event) => updateActivityForm("objective", event.target.value)}
                        placeholder={t("managementPlans.objectivePlaceholder")}
                        className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-zinc-400"
                      />
                    </div>

                    <div>
                      <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                        {t("common.details")}
                      </label>
                      <Textarea
                        value={createActivityForm.description}
                        onChange={(event) => updateActivityForm("description", event.target.value)}
                        placeholder={t("managementPlans.descriptionPlaceholder")}
                        className="min-h-36 rounded-2xl border-zinc-200 bg-white px-5 py-4 text-lg placeholder:text-slate-400"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <div className="text-[1rem] font-medium text-zinc-950">{t("managementPlans.financial")}</div>
                      <div className="mt-4 grid gap-8 lg:grid-cols-2">
                        <div>
                          <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                            {t("common.costSek")}
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
                            {t("common.revenueSek")}
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
                          {t("managementPlans.fishingEffortMultipliers")}
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
                          {t("managementPlans.constructionParameters")}
                        </div>
                        <div className="mt-5 grid gap-6 lg:grid-cols-2">
                          <div>
                            <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                              {t("managementPlans.category")}
                            </label>
                            <Select
                              value={createActivityForm.constructionCategory}
                              onValueChange={(value) =>
                                updateActivityForm("constructionCategory", value)
                              }
                            >
                              <SelectTrigger className="h-14 w-full rounded-2xl border-zinc-200 bg-white px-5 text-lg text-zinc-900">
                                <SelectValue placeholder={t("managementPlans.selectCategory")} />
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
                              {t("managementPlans.intensity")}
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
                              {t("managementPlans.constructionDescription")}
                            </label>
                            <Textarea
                              value={createActivityForm.constructionDescription}
                              onChange={(event) =>
                                updateActivityForm("constructionDescription", event.target.value)
                              }
                              placeholder={t("managementPlans.constructionDescriptionPlaceholder")}
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
                    {t("common.back")}
                  </Button>

                  <Button
                    type="button"
                    disabled={isCreatingActivity}
                    onClick={() => void handleSubmitActivity()}
                    className="h-14 rounded-2xl bg-[#4f7865] px-10 text-[1.2rem] font-medium text-white hover:bg-[#456b5a]"
                  >
                    {isCreatingActivity
                      ? isEditingActivity
                        ? t("common.saving")
                        : t("managementPlans.creatingPlan")
                      : isEditingActivity
                        ? t("managementPlans.saveChanges")
                        : t("managementPlans.createActivity")}
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
                {t("common.managementPlans")}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {filteredLocation
                  ? t("managementPlans.showingPlansFor", { location: filteredLocation.name?.trim() || t("managementPlans.selectedLocation") })
                  : t("managementPlans.createPlanFirst")}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void refreshPlans()}
              className="mt-1 rounded-lg bg-white px-3 text-sm text-zinc-700 shadow-sm"
            >
              {loading ? t("common.loading") : t("common.reload")}
            </Button>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t("managementPlans.failedToLoadPlans", { message: error.message })}
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed">
                <thead>
                  <tr className="border-b border-zinc-200 bg-white text-left text-sm text-zinc-800">
                    <th className="px-4 py-3 font-medium">{t("common.plan")}</th>
                    <th className="px-4 py-3 font-medium">{t("common.location")}</th>
                    <th className="px-4 py-3 font-medium">{t("common.activities")}</th>
                    <th className="px-4 py-3 font-medium">{t("common.startDate")}</th>
                    <th className="px-4 py-3 font-medium">{t("common.endDate")}</th>
                    <th className="px-4 py-3 font-medium">{t("common.costSek")}</th>
                    <th className="px-4 py-3 font-medium">{t("common.revenueSek")}</th>
                    <th className="px-4 py-3 font-medium">{t("common.status")}</th>
                    <th className="px-4 py-3 font-medium">{t("common.actions")}</th>
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
                            {t("common.open")}
                          </button>
                        </td>
                      </tr>
                    )})
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-zinc-500">
                        {loading
                          ? t("managementPlans.loadingPlans")
                          : filteredLocation
                            ? t("managementPlans.noPlansForLocation")
                            : t("managementPlans.noPlans")}
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
              {t("managementPlans.createNew")}
            </Button>
            {filteredLocation ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/management-plans")}
                className="h-9 rounded-lg border-zinc-300 bg-transparent px-4 text-sm font-medium text-zinc-700 hover:bg-white"
              >
                {t("tiles.clearLocationFilter")}
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
                <p className="text-[1.05rem] text-zinc-500">{t("managementPlans.newManagementPlan")}</p>
                <AlertDialogTitle className="mt-2 text-[2.1rem] font-medium leading-none text-zinc-950">
                  {t("managementPlans.createPlan")}
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
              {t("managementPlans.createPlanDescription")}
            </AlertDialogDescription>

            {createPlanError ? (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {createPlanError}
              </div>
            ) : null}

            <div className="mt-10">
              <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                {t("managementPlans.planName")}
              </label>
              <Input
                value={createPlanForm.name}
                onChange={(event) => {
                  setCreatePlanForm((prev) => ({ ...prev, name: event.target.value }))
                  setCreatePlanError(null)
                }}
                placeholder={t("managementPlans.planNamePlaceholder")}
                className="h-14 rounded-2xl border-zinc-200 bg-white px-5 text-lg placeholder:text-zinc-400"
              />
            </div>

            <div className="mt-8">
              <label className="mb-3 block text-[1rem] font-medium text-zinc-950">
                {t("common.location")}
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
                        ? t("managementPlans.loadingLocations")
                        : t("managementPlans.selectLocation")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((tile: Tile) => (
                    <SelectItem key={tile.id} value={tile.id}>
                      {tile.name?.trim() || t("common.untitledLocation")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-14 flex items-center justify-between gap-4">
              <AlertDialogCancel className="h-auto border-0 bg-transparent px-0 text-[1.1rem] font-medium text-zinc-700 shadow-none hover:bg-transparent hover:text-zinc-950">
                {t("common.cancel")}
              </AlertDialogCancel>

              <Button
                type="button"
                disabled={isCreatingPlan}
                onClick={() => void handleCreatePlan()}
                className="h-14 rounded-2xl bg-[#4f7865] px-7 text-[1.05rem] font-medium text-white hover:bg-[#456b5a]"
              >
                {isCreatingPlan ? t("managementPlans.creatingPlan") : t("managementPlans.createPlan")}
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
