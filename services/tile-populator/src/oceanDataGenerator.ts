import { downloadEarthEngineTile, getEeMaps } from "./earthEngineClient.ts"
import { generateDepthImage } from "./depthGenerator.ts"

export async function generateOceanDataAssets(
  credentials: Record<string, unknown>,
  geoTiffPath: string,
  tile: { x: number; y: number; zoom: number }
) {
  const eeMaps = await getEeMaps(credentials)
  const [waterVelocity, waterTemperature, depth] = await Promise.all([
    downloadEarthEngineTile(eeMaps.waterVelocityUrlFormat, [tile.x, tile.y, tile.zoom]),
    downloadEarthEngineTile(eeMaps.waterTemperatureUrlFormat, [tile.x, tile.y, tile.zoom]),
    generateDepthImage(geoTiffPath, tile),
  ])

  return {
    waterVelocity,
    waterTemperature,
    depth,
  }
}
