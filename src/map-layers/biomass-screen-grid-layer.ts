import { ScreenGridLayer } from "@deck.gl/aggregation-layers"

export type BiomassBounds = {
  lngMin: number
  lngMax: number
  latMin: number
  latMax: number
}

export type BiomassOverlayFrame = {
  data: Float32Array
  frame: number
  h: number
  w: number
  s: number
  speciesIndices?: number[]
  bounds: BiomassBounds
}

type BiomassPoint = {
  position: [number, number]
  weight: number
}

const biomassColorRange: [number, number, number, number][] = [
  [17, 24, 39, 0],
  [14, 165, 233, 70],
  [37, 99, 235, 120],
  [245, 158, 11, 170],
  [239, 68, 68, 220],
  [127, 29, 29, 255],
]

function buildBiomassPoints(frame: BiomassOverlayFrame) {
  const { data, h, w, s, bounds } = frame
  const frameOffset = frame.frame * h * w * s
  const speciesIndices =
    frame.speciesIndices?.filter((index) => index >= 0 && index < s) ??
    Array.from({ length: s }, (_, index) => index)

  const points: BiomassPoint[] = []
  let maxWeight = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Keep the same orientation fix as the previous raster overlay.
      const dataX = y
      const dataY = x
      const cellBase = frameOffset + (dataY * w + dataX) * s

      let weight = 0
      for (const sp of speciesIndices) {
        weight += data[cellBase + sp] ?? 0
      }
      if (weight <= 0) continue
      if (weight > maxWeight) maxWeight = weight

      const lng =
        bounds.lngMin + ((x + 0.5) / w) * (bounds.lngMax - bounds.lngMin)
      const lat =
        bounds.latMax - ((y + 0.5) / h) * (bounds.latMax - bounds.latMin)

      points.push({ position: [lng, lat], weight })
    }
  }

  return { points, maxWeight }
}

export function createBiomassScreenGridLayer(frame: BiomassOverlayFrame | null) {
  if (!frame) return null

  const { points, maxWeight } = buildBiomassPoints(frame)
  if (!points.length) return null

  return new ScreenGridLayer<BiomassPoint>({
    id: "biomass-screen-grid",
    data: points,
    gpuAggregation: true,
    aggregation: "SUM",
    cellSizePixels: 50,
    cellMarginPixels: 0,
    colorRange: biomassColorRange,
    colorScaleType: "linear",
    colorDomain: maxWeight > 0 ? [0, maxWeight] : null,
    getPosition: (d: BiomassPoint) => d.position,
    getWeight: (d: BiomassPoint) => d.weight,
    opacity: 0.75,
    pickable: true,
  })
}
