import type { Task, TaskData } from "@/state/ecotwin-types"
import { t } from "@/lib/translations"

export const DEFAULT_TICK_DURATION_DAYS = 1
export const MAX_PLAYBACK_FRAMES = 96

const DAY_MS = 24 * 60 * 60 * 1000

function taskData(task?: Task): TaskData | undefined {
  const value = task?.data
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value
}

export function taskTimingMode(task?: Task) {
  const timing = taskData(task)?.timing
  if (timing === "constant" || timing === "scheduled") return timing
  return task?.start || task?.end ? "scheduled" : "constant"
}

export function isConstantTask(task?: Task) {
  return taskTimingMode(task) === "constant"
}

export function parsePlanDate(value?: string | null) {
  if (!value) return null
  const datePart = value.substring(0, 10)
  const parsed = new Date(`${datePart}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatPlanDate(value?: string | null) {
  return value?.substring(0, 10) || t("common.unknownDate")
}

export function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS))
}

export type ManagementPlanDateRange = {
  startDate: string
  endDate: string
  durationDays: number
  tickDurationDays: number
  simulationTicks: number
  sampleEvery: number
}

export function sampleEveryForSimulationTicks(ticks: number) {
  if (!Number.isFinite(ticks) || ticks <= 0) return 1
  return Math.max(1, Math.ceil(ticks / MAX_PLAYBACK_FRAMES))
}

export function getManagementPlanDateRange(
  tasks: Task[],
  tickDurationDays = DEFAULT_TICK_DURATION_DAYS
): ManagementPlanDateRange | null {
  const scheduled = tasks
    .filter((task) => !isConstantTask(task))
    .map((task) => ({
      start: parsePlanDate(task.start),
      end: parsePlanDate(task.end ?? task.start),
    }))
    .filter(
      (range): range is { start: Date; end: Date } =>
        Boolean(range.start && range.end)
    )

  if (!scheduled.length) return null

  const start = scheduled.reduce(
    (min, range) => (range.start < min ? range.start : min),
    scheduled[0].start
  )
  const end = scheduled.reduce(
    (max, range) => (range.end > max ? range.end : max),
    scheduled[0].end
  )
  const durationDays = Math.max(1, daysBetween(start, end))
  const simulationTicks = Math.max(1, Math.ceil(durationDays / tickDurationDays))

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    durationDays,
    tickDurationDays,
    simulationTicks,
    sampleEvery: sampleEveryForSimulationTicks(simulationTicks),
  }
}

export function taskOffsetsInPlan(
  task: Task,
  range: ManagementPlanDateRange
) {
  if (isConstantTask(task)) {
    return {
      startDay: 0,
      endDay: range.durationDays,
      startTick: 0,
      endTick: range.simulationTicks,
    }
  }

  const planStart = parsePlanDate(range.startDate)
  const taskStart = parsePlanDate(task.start)
  const taskEnd = parsePlanDate(task.end ?? task.start)
  if (!planStart || !taskStart || !taskEnd) return null

  const startDay = Math.max(
    0,
    Math.min(range.durationDays, daysBetween(planStart, taskStart))
  )
  const endDay = Math.max(
    startDay,
    Math.min(range.durationDays, daysBetween(planStart, taskEnd))
  )
  return {
    startDay,
    endDay,
    startTick: Math.floor(startDay / range.tickDurationDays),
    endTick: Math.ceil(endDay / range.tickDurationDays),
  }
}
