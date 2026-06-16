import {
  formatSimulationDateRangeForSteps,
  normalizedTickDurationDays,
} from "@/lib/simulation-dates"
import { t } from "@/lib/translations"
import type { SimulationResultBase64, Tile } from "@/state/ecotwin-types"

const EARTH_RADIUS_METERS = 6378137

export type DetailRow = {
  label: string
  value: string
}

export function parseTileBbox(tile?: Tile | null) {
  const value = tile?.bbox
  if (!value) return null

  if (typeof value === "string") {
    const parsed = value
      .replace("[", "")
      .replace("]", "")
      .split(",")
      .map((part) => Number(part.trim()))
    if (parsed.length !== 4 || parsed.some((part) => !Number.isFinite(part))) return null
    return {
      minLng: parsed[0],
      minLat: parsed[1],
      maxLng: parsed[2],
      maxLat: parsed[3],
    }
  }

  if (Array.isArray(value) && value.length >= 4) {
    const parsed = value.slice(0, 4).map((part) => Number(part))
    if (parsed.some((part) => !Number.isFinite(part))) return null
    return {
      minLng: parsed[0],
      minLat: parsed[1],
      maxLng: parsed[2],
      maxLat: parsed[3],
    }
  }

  return null
}

export function tileAreaKm2(tile?: Tile | null) {
  const bbox = parseTileBbox(tile)
  if (!bbox) return null

  const lngMinRad = (bbox.minLng * Math.PI) / 180
  const lngMaxRad = (bbox.maxLng * Math.PI) / 180
  const latMinRad = (bbox.minLat * Math.PI) / 180
  const latMaxRad = (bbox.maxLat * Math.PI) / 180
  const area =
    EARTH_RADIUS_METERS *
    EARTH_RADIUS_METERS *
    Math.abs(lngMaxRad - lngMinRad) *
    Math.abs(Math.sin(latMaxRad) - Math.sin(latMinRad))

  return area / 1_000_000
}

export function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits }).format(value)
}

export function formatArea(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return `${formatNumber(value, value >= 100 ? 0 : 2)} km2`
}

export function formatMetersPerPixel(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return `${formatNumber(value, value >= 10 ? 1 : 2)} m/px`
}

export function formatAssetStatus(status?: string, hasAsset?: boolean) {
  if (hasAsset && (!status || status === "ready")) return "Ready"
  if (!status) return hasAsset ? "Ready" : null
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function simulationResultRows(result?: SimulationResultBase64 | null): DetailRow[] {
  if (!result) return []
  const [frames, height, width, species] = Array.isArray(result.shape)
    ? result.shape
    : []
  const firstStep = result.steps?.[0]
  const lastStep = result.steps?.[result.steps.length - 1]
  const hasSampleRange =
    typeof firstStep === "number" &&
    Number.isFinite(firstStep) &&
    typeof lastStep === "number" &&
    Number.isFinite(lastStep)
  const dateRange = hasSampleRange
    ? formatSimulationDateRangeForSteps(
        firstStep,
        lastStep,
        result.start_date,
        result.tick_duration_days
      )
    : null
  const tickDurationDays = normalizedTickDurationDays(result.tick_duration_days)
  const simulationDurationDays = Number.isFinite(result.episode_length)
    ? result.episode_length * tickDurationDays
    : null

  return [
    Number.isFinite(width) && Number.isFinite(height)
      ? { label: t("metrics.grid"), value: `${width}x${height}` }
      : null,
    Number.isFinite(frames) ? { label: t("metrics.samples"), value: String(frames) } : null,
    Number.isFinite(species) ? { label: t("common.species"), value: String(species) } : null,
    Number.isFinite(result.sample_every)
      ? { label: t("metrics.sampleInterval"), value: t("metrics.steps", { count: result.sample_every }) }
      : null,
    simulationDurationDays
      ? {
          label: t("metrics.simulationLength"),
          value: t("metrics.days", {
            count: formatNumber(simulationDurationDays, simulationDurationDays >= 10 ? 0 : 1),
          }),
        }
      : null,
    Number.isFinite(result.tick_duration_days)
      ? {
          label: t("metrics.timeScale"),
          value:
            tickDurationDays === 1
              ? t("metrics.daily")
              : t("metrics.dayIncrements", {
                  count: formatNumber(tickDurationDays, tickDurationDays >= 10 ? 0 : 1),
                }),
        }
      : null,
    dateRange
      ? { label: t("metrics.dateRange"), value: dateRange }
      : hasSampleRange
        ? { label: t("metrics.sampleRange"), value: `${firstStep}-${lastStep}` }
        : null,
  ].filter((row): row is DetailRow => Boolean(row))
}
