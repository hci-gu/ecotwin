import { H3HexagonLayer } from "@deck.gl/geo-layers"
import { latLngToCell } from "h3-js"

import type { BiomassOverlayFrame } from "./biomass-screen-grid-layer"

export type BiomassHexDatum = {
  hex: string
  count: number
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(v)))
}

export function h3ResolutionForZoom(zoom: number) {
  // Heuristic mapping from WebMercator zoom to H3 resolution.
  // Keeps the hex grid readable while avoiding excessive cell counts.
  return clampInt(zoom + 1, 4, 11)
}

function buildBiomassHexes(frame: BiomassOverlayFrame, h3Resolution: number) {
  const { data, h, w, s, bounds } = frame
  const frameOffset = frame.frame * h * w * s

  const byHex = new Map<string, number>()
  let maxCount = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Keep the same orientation fix as the previous raster overlay.
      const dataX = y
      const dataY = x
      const cellBase = frameOffset + (dataY * w + dataX) * s

      let weight = 0
      for (let sp = 0; sp < s; sp++) {
        weight += data[cellBase + sp] ?? 0
      }
      if (weight <= 0) continue

      const lng =
        bounds.lngMin + ((x + 0.5) / w) * (bounds.lngMax - bounds.lngMin)
      const lat =
        bounds.latMax - ((y + 0.5) / h) * (bounds.latMax - bounds.latMin)

      const hex = latLngToCell(lat, lng, h3Resolution)
      const next = (byHex.get(hex) ?? 0) + weight
      byHex.set(hex, next)
      if (next > maxCount) maxCount = next
    }
  }

  const hexes: BiomassHexDatum[] = []
  for (const [hex, count] of byHex) hexes.push({ hex, count })

  return { hexes, maxCount }
}

export function createBiomassH3HexagonLayer(
  frame: BiomassOverlayFrame | null,
  zoom: number
) {
  if (!frame) return null

  const h3Resolution = h3ResolutionForZoom(zoom)
  const { hexes, maxCount } = buildBiomassHexes(frame, h3Resolution)
  if (!hexes.length) return null

  return new H3HexagonLayer<BiomassHexDatum>({
    id: "biomass-h3-hex",
    data: hexes,
    pickable: true,
    extruded: true,
    opacity: 0.75,
    elevationScale: 8,
    getHexagon: (d) => d.hex,
    getFillColor: (d) => {
      const t = maxCount > 0 ? Math.max(0, Math.min(1, d.count / maxCount)) : 0
      return [255, Math.round((1 - t) * 255), 0, 190]
    },
    getElevation: (d) => d.count,
  })
}

