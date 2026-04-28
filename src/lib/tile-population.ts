import type { Tile } from "@/state/ecotwin-types"

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
    return { label: "Loading tile...", tone: "neutral" as TileStatusTone }
  }

  if (simulationRunning) {
    return { label: "Running...", tone: "warning" as TileStatusTone }
  }

  if (tile.landcoverStatus === "failed" || tile.oceanDataStatus === "failed") {
    return { label: "Generation failed", tone: "danger" as TileStatusTone }
  }

  if (isPending(tile.landcoverStatus)) {
    return { label: "Generating landcover...", tone: "warning" as TileStatusTone }
  }

  if (isPending(tile.oceanDataStatus)) {
    return { label: "Generating ocean data...", tone: "warning" as TileStatusTone }
  }

  if (tile.oceanDataStatus === "skipped") {
    return { label: "Ocean data skipped", tone: "neutral" as TileStatusTone }
  }

  if (!tile.landcover) {
    return { label: "Missing landcover", tone: "neutral" as TileStatusTone }
  }

  if (!tile.oceanData) {
    return { label: "Missing ocean data", tone: "neutral" as TileStatusTone }
  }

  return { label: "Ready to run", tone: "success" as TileStatusTone }
}

export function landcoverStatusMessage(tile?: Tile | null) {
  if (!tile) return "No landcover linked"
  if (tile.landcoverStatus === "failed") return "Generation failed"
  if (isPending(tile.landcoverStatus)) return "Generating landcover..."
  return "No landcover linked"
}

export function oceanDataStatusMessage(tile?: Tile | null) {
  if (!tile) return "No ocean data linked"
  if (tile.oceanDataStatus === "failed") return "Generation failed"
  if (tile.oceanDataStatus === "skipped") return "Ocean data skipped"
  if (isPending(tile.oceanDataStatus)) return "Generating ocean data..."
  return "No ocean data linked"
}
