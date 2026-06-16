import { ColumnLayer } from "@deck.gl/layers"
import { cellToLatLng, latLngToCell } from "h3-js"

import { getSpeciesColor } from "@/lib/species-colors"
import type { BiomassOverlayFrame } from "./biomass-screen-grid-layer"

export type BiomassHexDatum = {
  hex: string
  species: string
  position: [number, number]
  count: number
  color: [number, number, number]
}

type HexSpeciesAccumulator = {
  count: number
  cells: number
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(v)))
}

export function h3ResolutionForZoom(zoom: number) {
  // Heuristic mapping from WebMercator zoom to H3 resolution.
  // Keeps the hex grid readable while avoiding excessive cell counts.
  return clampInt(zoom + 1, 4, 11)
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)))
  return sorted[index]
}

function normalizedHexWeight(count: number, maxCount: number) {
  return maxCount > 0 ? Math.max(0, Math.min(1, count / maxCount)) : 0
}

function offsetPosition(
  lng: number,
  lat: number,
  index: number,
  total: number,
  radiusDegrees: number
): [number, number] {
  if (total <= 1) return [lng, lat]

  const angle = (Math.PI * 2 * index) / total - Math.PI / 2
  const lngScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  return [
    lng + (Math.cos(angle) * radiusDegrees) / lngScale,
    lat + Math.sin(angle) * radiusDegrees,
  ]
}

function buildBiomassHexes(frame: BiomassOverlayFrame, h3Resolution: number) {
  const { data, h, w, s, bounds } = frame
  const frameOffset = frame.frame * h * w * s
  const speciesIndices =
    frame.speciesIndices?.filter((index) => index >= 0 && index < s) ??
    Array.from({ length: s }, (_, index) => index)
  if (!speciesIndices.length) return { hexes: [], maxCount: 0 }

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
        const max = speciesMax[sp]
        const concentration = max > 0 ? (data[cellBase + sp] ?? 0) / max : 0
        if (concentration > 0) speciesPositiveConcentrations[sp]?.push(concentration)
      }
    }
  }

  const speciesVisibilityFloor = speciesPositiveConcentrations.map((values) =>
    values.length ? Math.max(0.01, percentile(values, 0.6)) : 1
  )

  const byHexSpecies = new Map<string, HexSpeciesAccumulator>()
  let maxCount = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cellBase = frameOffset + (y * w + x) * s
      const lng =
        bounds.lngMin + ((x + 0.5) / w) * (bounds.lngMax - bounds.lngMin)
      const lat =
        bounds.latMax - ((y + 0.5) / h) * (bounds.latMax - bounds.latMin)
      const hex = latLngToCell(lat, lng, h3Resolution)

      for (const sp of speciesIndices) {
        const max = speciesMax[sp]
        const floor = speciesVisibilityFloor[sp] ?? 1
        const concentration = max > 0 ? (data[cellBase + sp] ?? 0) / max : 0
        if (concentration <= floor) continue

        const intensity = Math.max(
          0,
          Math.min(1, (concentration - floor) / Math.max(1e-6, 1 - floor))
        )
        const key = `${hex}:${sp}`
        const next = byHexSpecies.get(key) ?? { count: 0, cells: 0 }
        next.count += intensity
        next.cells += 1
        byHexSpecies.set(key, next)
        if (next.count > maxCount) maxCount = next.count
      }
    }
  }

  const speciesByHex = new Map<string, number[]>()
  for (const key of byHexSpecies.keys()) {
    const [hex, spString] = key.split(":")
    const sp = Number(spString)
    if (!hex || !Number.isFinite(sp)) continue
    speciesByHex.set(hex, [...(speciesByHex.get(hex) ?? []), sp])
  }
  for (const [hex, indices] of speciesByHex) {
    speciesByHex.set(hex, indices.sort((left, right) => left - right))
  }

  const hexes: BiomassHexDatum[] = []
  const tileSpanDegrees = Math.min(
    Math.abs(bounds.lngMax - bounds.lngMin),
    Math.abs(bounds.latMax - bounds.latMin)
  )
  const columnRadiusDegrees = tileSpanDegrees / Math.max(w, h) / 5
  const offsetRadiusDegrees = columnRadiusDegrees * 1.9

  for (const [key, value] of byHexSpecies) {
    const [hex, spString] = key.split(":")
    const sp = Number(spString)
    if (!hex || !Number.isFinite(sp)) continue

    const [lat, lng] = cellToLatLng(hex)
    const siblings = speciesByHex.get(hex) ?? [sp]
    const siblingIndex = Math.max(0, siblings.indexOf(sp))
    const position = offsetPosition(
      lng,
      lat,
      siblingIndex,
      siblings.length,
      offsetRadiusDegrees
    )

    hexes.push({
      hex,
      species: frame.species?.[sp] ?? `Species ${sp + 1}`,
      position,
      count: value.count,
      color: getSpeciesColor(frame.species?.[sp], sp).rgb,
    })
  }

  return { hexes, maxCount, radius: columnRadiusDegrees * 111_000 }
}

export function createBiomassH3HexagonLayer(
  frame: BiomassOverlayFrame | null,
  zoom: number
) {
  if (!frame) return null

  const h3Resolution = h3ResolutionForZoom(zoom)
  const { hexes, maxCount, radius } = buildBiomassHexes(frame, h3Resolution)
  if (!hexes.length) return null

  return new ColumnLayer<BiomassHexDatum>({
    id: "biomass-h3-hex",
    data: hexes,
    diskResolution: 6,
    radius,
    pickable: true,
    extruded: true,
    opacity: 0.9,
    getPosition: (d) => d.position,
    getFillColor: (d) => [...d.color, 220],
    getElevation: (d) => {
      const t = normalizedHexWeight(d.count, maxCount)
      return Math.pow(t, 1.25) * 20000
    },
  })
}
