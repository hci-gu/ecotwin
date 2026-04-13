import { tileCenterLngLat, tileCornerLngLat } from "@/map-layers"

export type TileSelectionCandidate = {
  x: number
  y: number
  zoom: number
  bbox: string
  center: {
    lng: number
    lat: number
  }
  polygon: [number, number][]
}

function clampLat(lat: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat))
}

export function normalizeTileZoom(zoom: number) {
  return Math.max(0, Math.min(22, Math.floor(zoom)))
}

export function lngLatToTileXY(lng: number, lat: number, zoom: number) {
  const normalizedZoom = normalizeTileZoom(zoom)
  const n = 2 ** normalizedZoom
  const wrappedLng = ((((lng + 180) % 360) + 360) % 360) - 180
  const latClamped = clampLat(lat)
  const latRad = (latClamped * Math.PI) / 180
  const x = Math.min(n - 1, Math.max(0, Math.floor(((wrappedLng + 180) / 360) * n)))
  const y = Math.min(
    n - 1,
    Math.max(
      0,
      Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
      )
    )
  )
  return { x, y, zoom: normalizedZoom }
}

export function tileSelectionCandidateFromLngLat(lng: number, lat: number, zoom: number): TileSelectionCandidate {
  const tile = lngLatToTileXY(lng, lat, zoom)
  return tileSelectionCandidateFromXYZ(tile.x, tile.y, tile.zoom)
}

export function tileSelectionCandidateFromXYZ(
  x: number,
  y: number,
  zoom: number
): TileSelectionCandidate {
  const normalizedZoom = normalizeTileZoom(zoom)
  const topLeft = tileCornerLngLat(x, y, normalizedZoom)
  const bottomRight = tileCornerLngLat(x + 1, y + 1, normalizedZoom)
  const topRight = { lng: bottomRight.lng, lat: topLeft.lat }
  const bottomLeft = { lng: topLeft.lng, lat: bottomRight.lat }
  const center = tileCenterLngLat(x, y, normalizedZoom)

  return {
    x,
    y,
    zoom: normalizedZoom,
    bbox: `[${topLeft.lng},${bottomRight.lat},${bottomRight.lng},${topLeft.lat}]`,
    center,
    polygon: [
      [topLeft.lng, topLeft.lat],
      [topRight.lng, topRight.lat],
      [bottomRight.lng, bottomRight.lat],
      [bottomLeft.lng, bottomLeft.lat],
      [topLeft.lng, topLeft.lat],
    ],
  }
}
