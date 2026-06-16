import { t } from "@/lib/translations"

export function tileCenterLngLat(x: number, y: number, zoom: number) {
  const n = 2 ** zoom
  const lng = ((x + 0.5) / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)))
  const lat = (latRad * 180) / Math.PI
  return { lng, lat }
}

export function tileCornerLngLat(x: number, y: number, zoom: number) {
  const n = 2 ** zoom
  const lng = (x / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  const lat = (latRad * 180) / Math.PI
  return { lng, lat }
}

export function formatTileLabel(name: string | undefined) {
  const label = name?.trim() || t("common.untitledTile")
  return label.length > 44 ? `${label.slice(0, 43)}…` : label
}
