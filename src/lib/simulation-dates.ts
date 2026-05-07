const DAY_MS = 24 * 60 * 60 * 1000

export function parseSimulationDate(value?: string | null) {
  if (!value) return null
  const datePart = value.substring(0, 10)
  const parsed = new Date(`${datePart}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatSimulationDate(value?: string | Date | null) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  }
  return parseSimulationDate(value)?.toISOString().slice(0, 10) ?? null
}

export function normalizedTickDurationDays(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1
}

export function simulationDateForStep(
  step: number,
  startDate?: string | null,
  tickDurationDays?: number | null
) {
  const start = parseSimulationDate(startDate)
  if (!start || !Number.isFinite(step)) return null

  const offsetDays = Math.round(step * normalizedTickDurationDays(tickDurationDays))
  return new Date(start.getTime() + offsetDays * DAY_MS)
}

export function formatSimulationDateForStep(
  step: number,
  startDate?: string | null,
  tickDurationDays?: number | null
) {
  return formatSimulationDate(simulationDateForStep(step, startDate, tickDurationDays))
}

export function formatSimulationDateRangeForSteps(
  startStep: number,
  endStep: number,
  startDate?: string | null,
  tickDurationDays?: number | null
) {
  const startLabel = formatSimulationDateForStep(startStep, startDate, tickDurationDays)
  const endLabel = formatSimulationDateForStep(endStep, startDate, tickDurationDays)
  if (!startLabel || !endLabel) return null
  return startLabel === endLabel ? startLabel : `${startLabel} to ${endLabel}`
}
