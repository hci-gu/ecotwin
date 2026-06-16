import type PocketBase from "pocketbase"

import type { TilePopulatorConfig } from "./config.ts"
import { generateLandcoverImage } from "./landcoverGenerator.ts"
import { generateOceanDataAssets } from "./oceanDataGenerator.ts"
import {
  claimNextJob,
  completeJob,
  createLandcover,
  createOceanData,
  createPocketBaseClient,
  ensurePopulationJob,
  getLandcover,
  getTile,
  getWaterCoveragePercent,
  JOB_STATUS_FAILED,
  JOB_STATUS_SKIPPED,
  JOB_STATUS_SUCCEEDED,
  LANDCOVER_JOB_KIND,
  listTilesForBackfill,
  OCEAN_DATA_JOB_KIND,
  TILE_STATUS_FAILED,
  TILE_STATUS_PENDING,
  TILE_STATUS_PROCESSING,
  TILE_STATUS_READY,
  TILE_STATUS_SKIPPED,
  updateTile,
  type LandcoverRecord,
  type TilePopulationJobRecord,
  type TileRecord,
} from "./pocketbase.ts"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function updateTileStatuses(
  pb: PocketBase,
  tile: TileRecord,
  statuses: Partial<Pick<TileRecord, "landcoverStatus" | "oceanDataStatus" | "landcover" | "oceanData">>
) {
  const patch: Partial<TileRecord> = {}

  for (const [key, value] of Object.entries(statuses)) {
    const typedKey = key as keyof typeof statuses
    if (value === undefined || tile[typedKey] === value) continue
    patch[typedKey] = value
  }

  if (!Object.keys(patch).length) return tile

  return updateTile(pb, tile.id, patch)
}

async function reconcileOceanState(pb: PocketBase, tile: TileRecord, landcover: LandcoverRecord) {
  if (tile.oceanData) {
    return updateTileStatuses(pb, tile, { oceanDataStatus: TILE_STATUS_READY })
  }

  const waterCoverage = getWaterCoveragePercent(landcover)
  if (waterCoverage > 40) {
    await ensurePopulationJob(pb, tile.id, OCEAN_DATA_JOB_KIND)
    return updateTileStatuses(pb, tile, { oceanDataStatus: TILE_STATUS_PENDING })
  }

  return updateTileStatuses(pb, tile, { oceanDataStatus: TILE_STATUS_SKIPPED })
}

async function handleLandcoverJob(pb: PocketBase, config: TilePopulatorConfig, job: TilePopulationJobRecord) {
  let tile = await getTile(pb, job.tile)
  tile = await updateTileStatuses(pb, tile, { landcoverStatus: TILE_STATUS_PROCESSING })

  if (tile.landcover) {
    const landcover = await getLandcover(pb, tile.landcover)
    await reconcileOceanState(pb, tile, landcover)
    await completeJob(pb, job.id, JOB_STATUS_SUCCEEDED)
    await updateTileStatuses(pb, tile, { landcoverStatus: TILE_STATUS_READY })
    return
  }

  const image = await generateLandcoverImage(config.earthEngineCredentials, tile)
  const landcover = await createLandcover(pb, image)
  tile = await updateTileStatuses(pb, tile, {
    landcover: landcover.id,
    landcoverStatus: TILE_STATUS_READY,
  })

  await reconcileOceanState(pb, tile, landcover)
  await completeJob(pb, job.id, JOB_STATUS_SUCCEEDED)
}

async function handleOceanDataJob(pb: PocketBase, config: TilePopulatorConfig, job: TilePopulationJobRecord) {
  let tile = await getTile(pb, job.tile)
  tile = await updateTileStatuses(pb, tile, { oceanDataStatus: TILE_STATUS_PROCESSING })

  if (tile.oceanData) {
    await completeJob(pb, job.id, JOB_STATUS_SUCCEEDED)
    await updateTileStatuses(pb, tile, { oceanDataStatus: TILE_STATUS_READY })
    return
  }

  if (!tile.landcover) {
    throw new Error("Tile is missing landcover relation")
  }

  const landcover = await getLandcover(pb, tile.landcover)
  if (getWaterCoveragePercent(landcover) <= 40) {
    await updateTileStatuses(pb, tile, { oceanDataStatus: TILE_STATUS_SKIPPED })
    await completeJob(pb, job.id, JOB_STATUS_SKIPPED)
    return
  }

  const assets = await generateOceanDataAssets(config.earthEngineCredentials, config.geoTiffPath, tile)
  const oceanData = await createOceanData(pb, assets)

  await updateTileStatuses(pb, tile, {
    oceanData: oceanData.id,
    oceanDataStatus: TILE_STATUS_READY,
  })
  await completeJob(pb, job.id, JOB_STATUS_SUCCEEDED)
}

async function failJob(pb: PocketBase, job: TilePopulationJobRecord, message: string) {
  const tile = await getTile(pb, job.tile)
  if (job.kind === LANDCOVER_JOB_KIND) {
    await updateTileStatuses(pb, tile, { landcoverStatus: TILE_STATUS_FAILED })
  }

  if (job.kind === OCEAN_DATA_JOB_KIND) {
    await updateTileStatuses(pb, tile, { oceanDataStatus: TILE_STATUS_FAILED })
  }

  await completeJob(pb, job.id, JOB_STATUS_FAILED, message)
}

async function processJob(pb: PocketBase, config: TilePopulatorConfig, job: TilePopulationJobRecord) {
  if (job.kind === LANDCOVER_JOB_KIND) {
    await handleLandcoverJob(pb, config, job)
    return
  }

  if (job.kind === OCEAN_DATA_JOB_KIND) {
    await handleOceanDataJob(pb, config, job)
    return
  }

  await completeJob(pb, job.id, JOB_STATUS_SKIPPED, `Unknown job kind: ${job.kind}`)
}

async function backfillTilePopulation(pb: PocketBase) {
  const tiles = await listTilesForBackfill(pb)

  for (const tile of tiles) {
    if (!tile.landcover) {
      if (tile.landcoverStatus !== TILE_STATUS_PROCESSING) {
        await updateTileStatuses(pb, tile, { landcoverStatus: TILE_STATUS_PENDING })
      }
      await ensurePopulationJob(pb, tile.id, LANDCOVER_JOB_KIND)
      continue
    }

    let nextTile = await updateTileStatuses(pb, tile, { landcoverStatus: TILE_STATUS_READY })
    const landcover = await getLandcover(pb, nextTile.landcover!)

    if (nextTile.oceanData) {
      await updateTileStatuses(pb, nextTile, { oceanDataStatus: TILE_STATUS_READY })
      continue
    }

    const waterCoverage = getWaterCoveragePercent(landcover)
    if (waterCoverage > 40) {
      if (
        nextTile.oceanDataStatus !== TILE_STATUS_PROCESSING &&
        nextTile.oceanDataStatus !== TILE_STATUS_FAILED &&
        nextTile.oceanDataStatus !== TILE_STATUS_READY
      ) {
        nextTile = await updateTileStatuses(pb, nextTile, { oceanDataStatus: TILE_STATUS_PENDING })
      }
      await ensurePopulationJob(pb, nextTile.id, OCEAN_DATA_JOB_KIND)
      continue
    }

    await updateTileStatuses(pb, nextTile, { oceanDataStatus: TILE_STATUS_SKIPPED })
  }
}

async function runWorker(pb: PocketBase, config: TilePopulatorConfig) {
  while (true) {
    const job = await claimNextJob(pb, config.leaseDurationMs)
    if (!job) {
      await sleep(config.pollIntervalMs)
      continue
    }

    try {
      await processJob(pb, config, job)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[tile-populator] job ${job.id} failed: ${message}`)
      await failJob(pb, job, message)
    }
  }
}

export async function runJobRunner(config: TilePopulatorConfig) {
  const pb = await createPocketBaseClient(config)
  await backfillTilePopulation(pb)

  const workers = Array.from({ length: config.concurrency }, () => runWorker(pb, config))
  await Promise.all(workers)
}
