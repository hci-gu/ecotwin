import { getChildren } from "@mapbox/tilebelt"

import { downloadEarthEngineTile, getLandcoverUrlFormat } from "./earthEngineClient.ts"
import { stitchTileImages } from "./imageUtils.ts"

export async function generateLandcoverImage(
  credentials: Record<string, unknown>,
  tile: { x: number; y: number; zoom: number }
) {
  const landcoverUrlFormat = await getLandcoverUrlFormat(credentials)
  const childTiles = getChildren([tile.x, tile.y, tile.zoom])
  const downloads = await Promise.all(
    childTiles.map((childTile) => downloadEarthEngineTile(landcoverUrlFormat, childTile))
  )

  return stitchTileImages(downloads)
}
