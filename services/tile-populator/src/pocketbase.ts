import PocketBase, { type RecordModel } from "pocketbase"

import type { TilePopulatorConfig } from "./config.ts"

export const LANDCOVER_JOB_KIND = "landcover"
export const OCEAN_DATA_JOB_KIND = "oceanData"

export const JOB_STATUS_PENDING = "pending"
export const JOB_STATUS_PROCESSING = "processing"
export const JOB_STATUS_SUCCEEDED = "succeeded"
export const JOB_STATUS_FAILED = "failed"
export const JOB_STATUS_SKIPPED = "skipped"

export const TILE_STATUS_PENDING = "pending"
export const TILE_STATUS_PROCESSING = "processing"
export const TILE_STATUS_READY = "ready"
export const TILE_STATUS_FAILED = "failed"
export const TILE_STATUS_SKIPPED = "skipped"

export type TileRecord = RecordModel & {
  x: number
  y: number
  zoom: number
  landcover?: string
  oceanData?: string
  landcoverStatus?: string
  oceanDataStatus?: string
}

export type LandcoverRecord = RecordModel & {
  coverage?: unknown
  color?: string
  color_100?: string
}

export type OceanDataRecord = RecordModel & {
  surface_elevation?: string
  water_temperature?: string
  water_velocity?: string
  depth?: string
}

export type TilePopulationJobRecord = RecordModel & {
  tile: string
  kind: string
  status: string
  attemptCount?: number
  lastError?: string
  leaseUntil?: string
  startedAt?: string
  finishedAt?: string
}

function escapeFilterValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function toFileBytes(buffer: Buffer) {
  return new Uint8Array(buffer)
}

function toPocketBaseDateTime(date: Date) {
  return date.toISOString().replace("T", " ")
}

export async function createPocketBaseClient(config: TilePopulatorConfig) {
  const pb = new PocketBase(config.pocketbaseUrl)
  pb.autoCancellation(false)
  await pb.collection("_superusers").authWithPassword(config.pocketbaseEmail, config.pocketbasePassword)
  return pb
}

export async function listTilesForBackfill(pb: PocketBase) {
  return pb.collection("tiles").getFullList<TileRecord>({ sort: "created" })
}

export async function getTile(pb: PocketBase, id: string) {
  return pb.collection("tiles").getOne<TileRecord>(id)
}

export async function getLandcover(pb: PocketBase, id: string) {
  return pb.collection("landcovers").getOne<LandcoverRecord>(id)
}

export async function createLandcover(pb: PocketBase, image: Buffer) {
  const formData = new FormData()
  formData.set("original", new File([toFileBytes(image)], "landcover.png", { type: "image/png" }))
  return pb.collection("landcovers").create<LandcoverRecord>(formData)
}

export async function createOceanData(
  pb: PocketBase,
  assets: { waterVelocity: Buffer; waterTemperature: Buffer; depth?: Buffer }
) {
  const formData = new FormData()
  formData.set(
    "water_velocity",
    new File([toFileBytes(assets.waterVelocity)], "water_velocity.png", { type: "image/png" })
  )
  formData.set(
    "water_temperature",
    new File([toFileBytes(assets.waterTemperature)], "water_temperature.png", { type: "image/png" })
  )
  if (assets.depth) {
    formData.set("depth", new File([toFileBytes(assets.depth)], "depth.png", { type: "image/png" }))
  }
  return pb.collection("oceanData").create<OceanDataRecord>(formData)
}

export async function updateTile(pb: PocketBase, id: string, data: Partial<TileRecord>) {
  return pb.collection("tiles").update<TileRecord>(id, data)
}

export async function ensurePopulationJob(pb: PocketBase, tileId: string, kind: string) {
  const filter = `tile = "${escapeFilterValue(tileId)}" && kind = "${escapeFilterValue(kind)}"`
  const existing = await pb.collection("tilePopulationJobs").getList<TilePopulationJobRecord>(1, 1, { filter })
  if (existing.items[0]) {
    return existing.items[0]
  }

  return pb.collection("tilePopulationJobs").create<TilePopulationJobRecord>({
    tile: tileId,
    kind,
    status: JOB_STATUS_PENDING,
    attemptCount: 0,
  })
}

export async function claimNextJob(pb: PocketBase, leaseDurationMs: number) {
  const now = toPocketBaseDateTime(new Date())
  const response = await pb.collection("tilePopulationJobs").getList<TilePopulationJobRecord>(1, 1, {
    filter: `status = "${JOB_STATUS_PENDING}" || (status = "${JOB_STATUS_PROCESSING}" && leaseUntil != "" && leaseUntil <= "${now}")`,
  })

  const job = response.items[0]
  if (!job) return null

  return pb.collection("tilePopulationJobs").update<TilePopulationJobRecord>(job.id, {
    status: JOB_STATUS_PROCESSING,
    attemptCount: (job.attemptCount ?? 0) + 1,
    lastError: "",
    startedAt: now,
    finishedAt: "",
    leaseUntil: toPocketBaseDateTime(new Date(Date.now() + leaseDurationMs)),
  })
}

export async function completeJob(
  pb: PocketBase,
  jobId: string,
  status: typeof JOB_STATUS_SUCCEEDED | typeof JOB_STATUS_FAILED | typeof JOB_STATUS_SKIPPED,
  lastError = ""
) {
  return pb.collection("tilePopulationJobs").update<TilePopulationJobRecord>(jobId, {
    status,
    lastError,
    leaseUntil: "",
    finishedAt: toPocketBaseDateTime(new Date()),
  })
}

export function getWaterCoveragePercent(landcover: LandcoverRecord) {
  const raw = landcover.coverage
  const coverage =
    typeof raw === "string"
      ? (JSON.parse(raw) as Record<string, unknown>)
      : ((raw ?? {}) as Record<string, unknown>)

  const water = coverage.water
  if (typeof water === "number") return water
  if (typeof water === "string") {
    const parsed = Number.parseFloat(water)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}
