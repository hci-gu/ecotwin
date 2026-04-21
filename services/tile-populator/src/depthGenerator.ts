import { readFile } from "node:fs/promises"

import { fromArrayBuffer } from "geotiff"
import proj4 from "proj4"
import sharp from "sharp"

const EPSG3857 =
  "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
const EPSG3035 =
  "+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +units=m +no_defs"

proj4.defs("EPSG:3857", EPSG3857)
proj4.defs("EPSG:3035", EPSG3035)

function reprojectBounds([minX, minY, maxX, maxY]: [number, number, number, number]) {
  const [xMin, yMin] = proj4("EPSG:3857", "EPSG:3035", [minX, minY])
  const [xMax, yMax] = proj4("EPSG:3857", "EPSG:3035", [maxX, maxY])
  return [xMin, yMin, xMax, yMax] as const
}

function lonLatToWebMerc(lon: number, lat: number) {
  const x = (lon * 20037508.34) / 180
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)
  y = (y * 20037508.34) / 180
  return [x, y] as const
}

function tileToWebMercatorBounds(z: number, x: number, y: number) {
  const n = 2 ** z
  const lonMin = (x / n) * 360 - 180
  const lonMax = ((x + 1) / n) * 360 - 180
  const latMin = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  const latMax = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI
  const [minX, minY] = lonLatToWebMerc(lonMin, latMin)
  const [maxX, maxY] = lonLatToWebMerc(lonMax, latMax)
  return [minX, minY, maxX, maxY] as const
}

function worldToPixel(
  x: number,
  y: number,
  originX: number,
  originY: number,
  resolutionX: number,
  resolutionY: number
) {
  const px = Math.floor((x - originX) / resolutionX)
  const py = Math.floor((originY - y) / Math.abs(resolutionY))
  return [px, py] as const
}

function toMinMax(values: Float32Array) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const value of values) {
    if (value === -32767) continue
    if (value < min) min = value
    if (value > max) max = value
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error("No valid elevation data found in GeoTIFF window")
  }

  return { min, max }
}

export async function generateDepthImage(
  geoTiffPath: string,
  tile: { x: number; y: number; zoom: number }
) {
  const data = await readFile(geoTiffPath)
  const tiff = await fromArrayBuffer(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  const image = await tiff.getImage()

  const [minX, minY, maxX, maxY] = tileToWebMercatorBounds(tile.zoom, tile.x, tile.y)
  const [reprojectedMinX, reprojectedMinY, reprojectedMaxX, reprojectedMaxY] =
    reprojectBounds([minX, minY, maxX, maxY])

  const tiePoints = image.getFileDirectory().ModelTiepoint
  const pixelScale = image.getFileDirectory().ModelPixelScale
  const originX = tiePoints[3]
  const originY = tiePoints[4]
  const resolutionX = pixelScale[0]
  const resolutionY = pixelScale[1]

  const [pxMin, pyMin] = worldToPixel(
    reprojectedMinX,
    reprojectedMinY,
    originX,
    originY,
    resolutionX,
    resolutionY
  )
  const [pxMax, pyMax] = worldToPixel(
    reprojectedMaxX,
    reprojectedMaxY,
    originX,
    originY,
    resolutionX,
    resolutionY
  )

  const window = [
    Math.max(0, Math.min(pxMin, pxMax)),
    Math.max(0, Math.min(pyMin, pyMax)),
    Math.min(image.getWidth(), Math.max(pxMin, pxMax)),
    Math.min(image.getHeight(), Math.max(pyMin, pyMax)),
  ]

  const windowWidth = window[2] - window[0]
  const windowHeight = window[3] - window[1]
  if (windowWidth <= 0 || windowHeight <= 0) {
    throw new Error("Requested depth window is outside the GeoTIFF bounds")
  }

  const rasters = await image.readRasters({ window })
  const elevationData = rasters[0] as Float32Array
  const targetWidth = 100
  const targetHeight = 100
  const sampled = new Float32Array(targetWidth * targetHeight)

  for (let row = 0; row < targetHeight; row += 1) {
    const sourceY = Math.floor((row / (targetHeight - 1)) * (windowHeight - 1))
    for (let column = 0; column < targetWidth; column += 1) {
      const sourceX = Math.floor((column / (targetWidth - 1)) * (windowWidth - 1))
      sampled[row * targetWidth + column] = elevationData[sourceY * windowWidth + sourceX]
    }
  }

  const { min, max } = toMinMax(sampled)
  const grayscale = new Uint8Array(targetWidth * targetHeight)

  for (let index = 0; index < sampled.length; index += 1) {
    const value = sampled[index]
    const normalized = value === -32767 || max === min ? 0 : Math.floor(((value - min) / (max - min)) * 255)
    grayscale[index] = normalized
  }

  return sharp(Buffer.from(grayscale), {
    raw: {
      width: targetWidth,
      height: targetHeight,
      channels: 1,
    },
  })
    .png()
    .toBuffer()
}
