import { getChildren } from "@mapbox/tilebelt"

import { downloadEarthEngineTile, getEeMaps } from "./earthEngineClient.ts"
import { stitchTileImages } from "./imageUtils.ts"

export async function generateLandcoverImage(
  credentials: Record<string, unknown>,
  tile: { x: number; y: number; zoom: number }
) {
  const eeMaps = await getEeMaps(credentials)
  const childTiles = getChildren([tile.x, tile.y, tile.zoom])
  const downloads = await Promise.all(
    childTiles.map((childTile) => downloadEarthEngineTile(eeMaps.landcoverUrlFormat, childTile))
  )

  return stitchTileImages(downloads)
}
