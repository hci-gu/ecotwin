import { BitmapLayer } from "@deck.gl/layers"
import { GL } from "@luma.gl/constants"

import { getSpeciesColor } from "@/lib/species-colors"

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
  species?: string[]
  speciesIndices?: number[]
  bounds: BiomassBounds
}

function speciesColor(frame: BiomassOverlayFrame, speciesIndex: number) {
  return getSpeciesColor(frame.species?.[speciesIndex], speciesIndex).rgb
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)))
  return sorted[index]
}

function buildBiomassBitmap(frame: BiomassOverlayFrame) {
  const { data, h, w, s, bounds } = frame
  const cellScale = Math.max(1, Math.floor(160 / Math.max(w, h)))
  const bitmapW = w * cellScale
  const bitmapH = h * cellScale
  const frameOffset = frame.frame * h * w * s
  const speciesIndices =
    frame.speciesIndices?.filter((index) => index >= 0 && index < s) ??
    Array.from({ length: s }, (_, index) => index)
  if (!speciesIndices.length) return null

  const speciesMax = new Float32Array(s)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cellBase = frameOffset + (y * w + x) * s
      for (const sp of speciesIndices) {
        const value = data[cellBase + sp] ?? 0
        if (value > speciesMax[sp]) speciesMax[sp] = value
      }
    }
  }

  const speciesPositiveConcentrations = Array.from(
    { length: s },
    () => [] as number[]
  )

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cellBase = frameOffset + (y * w + x) * s

      for (const sp of speciesIndices) {
        const value = data[cellBase + sp] ?? 0
        const max = speciesMax[sp]
        const concentration = max > 0 ? value / max : 0
        if (concentration > 0) speciesPositiveConcentrations[sp]?.push(concentration)
      }
    }
  }

  const speciesVisibilityFloor = speciesPositiveConcentrations.map((values) =>
    values.length ? Math.max(0.01, percentile(values, 0.6)) : 1
  )
  if (!speciesVisibilityFloor.some((floor) => floor < 1)) return null

  const pixels = new Uint8ClampedArray(bitmapW * bitmapH * 4)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cellBase = frameOffset + (y * w + x) * s
      let rOut = 0
      let gOut = 0
      let bOut = 0
      let coverage = 0

      for (const sp of speciesIndices) {
        const max = speciesMax[sp]
        const floor = speciesVisibilityFloor[sp] ?? 1
        const concentration = max > 0 ? (data[cellBase + sp] ?? 0) / max : 0
        if (concentration <= floor) continue

        const intensity = Math.max(
          0,
          Math.min(1, (concentration - floor) / Math.max(1e-6, 1 - floor))
        )
        const [r, g, b] = speciesColor(frame, sp)
        rOut = 1 - (1 - rOut) * (1 - (r / 255) * intensity)
        gOut = 1 - (1 - gOut) * (1 - (g / 255) * intensity)
        bOut = 1 - (1 - bOut) * (1 - (b / 255) * intensity)
        coverage = 1 - (1 - coverage) * (1 - intensity)
      }

      if (coverage <= 0) continue

      const alpha = Math.round(90 + coverage * 165)
      for (let blockY = 0; blockY < cellScale; blockY++) {
        for (let blockX = 0; blockX < cellScale; blockX++) {
          const pixelIndex =
            ((y * cellScale + blockY) * bitmapW + (x * cellScale + blockX)) * 4
          pixels[pixelIndex] = Math.round(rOut * 255)
          pixels[pixelIndex + 1] = Math.round(gOut * 255)
          pixels[pixelIndex + 2] = Math.round(bOut * 255)
          pixels[pixelIndex + 3] = alpha
        }
      }
    }
  }

  return {
    image: new ImageData(pixels, bitmapW, bitmapH),
    bounds: [bounds.lngMin, bounds.latMin, bounds.lngMax, bounds.latMax] as [
      number,
      number,
      number,
      number,
    ],
  }
}

export function createBiomassScreenGridLayer(frame: BiomassOverlayFrame | null) {
  if (!frame) return null

  const bitmap = buildBiomassBitmap(frame)
  if (!bitmap) return null

  return new BitmapLayer({
    id: "biomass-screen-grid",
    image: bitmap.image,
    bounds: bitmap.bounds,
    opacity: 1,
    pickable: true,
    textureParameters: {
      [GL.TEXTURE_MIN_FILTER]: GL.NEAREST,
      [GL.TEXTURE_MAG_FILTER]: GL.NEAREST,
    },
  })
}
