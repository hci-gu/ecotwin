import type { Tile } from "@/state/ecotwin-types"
import { t } from "@/lib/translations"

export type TileStatusTone = "success" | "warning" | "danger" | "neutral"

function isPending(status?: string) {
  return status === "pending" || status === "processing"
}

export function hasActiveTileGeneration(tile?: Tile | null) {
  if (!tile) return false
  return isPending(tile.landcoverStatus) || isPending(tile.oceanDataStatus)
}

export function tilePrimaryStatus(tile?: Tile | null, simulationRunning = false) {
  if (!tile) {
    return { label: t("assets.loadingTile"), tone: "neutral" as TileStatusTone }
  }

  if (simulationRunning) {
    return { label: t("assets.running"), tone: "warning" as TileStatusTone }
  }

  if (tile.landcoverStatus === "failed" || tile.oceanDataStatus === "failed") {
    return { label: t("assets.generationFailed"), tone: "danger" as TileStatusTone }
  }

  if (isPending(tile.landcoverStatus)) {
    return { label: t("assets.generatingLandcover"), tone: "warning" as TileStatusTone }
  }

  if (isPending(tile.oceanDataStatus)) {
    return { label: t("assets.generatingOceanData"), tone: "warning" as TileStatusTone }
  }

  if (tile.oceanDataStatus === "skipped") {
    return { label: t("assets.oceanDataSkipped"), tone: "neutral" as TileStatusTone }
  }

  if (!tile.landcover) {
    return { label: t("assets.missingLandcover"), tone: "neutral" as TileStatusTone }
  }

  if (!tile.oceanData) {
    return { label: t("assets.missingOceanData"), tone: "neutral" as TileStatusTone }
  }

  return { label: t("assets.readyToRun"), tone: "success" as TileStatusTone }
}

export function landcoverStatusMessage(tile?: Tile | null) {
  if (!tile) return t("assets.noLandcoverLinked")
  if (tile.landcoverStatus === "failed") return t("assets.generationFailed")
  if (isPending(tile.landcoverStatus)) return t("assets.generatingLandcover")
  return t("assets.noLandcoverLinked")
}

export function oceanDataStatusMessage(tile?: Tile | null) {
  if (!tile) return t("assets.noOceanDataLinked")
  if (tile.oceanDataStatus === "failed") return t("assets.generationFailed")
  if (tile.oceanDataStatus === "skipped") return t("assets.oceanDataSkipped")
  if (isPending(tile.oceanDataStatus)) return t("assets.generatingOceanData")
  return t("assets.noOceanDataLinked")
}
