export type ActivityAreaPoint = [number, number]

export type ActivityAreaGeometry = {
  type: "Polygon"
  coordinates: ActivityAreaPoint[][]
}

export type ActivityAreaSummary = {
  areaKm2: number
  vertexCount: number
  centroid: {
    lat: number
    lng: number
  }
  bbox: {
    minLng: number
    minLat: number
    maxLng: number
    maxLat: number
  }
}

const EARTH_RADIUS_METERS = 6378137

function normalizePoint(point: ActivityAreaPoint): ActivityAreaPoint {
  return [Number(point[0]), Number(point[1])]
}

export function isValidActivityArea(points: ActivityAreaPoint[]) {
  return points.length >= 3
}

export function closeActivityAreaRing(points: ActivityAreaPoint[]): ActivityAreaPoint[] {
  if (!points.length) return []
  const normalized = points.map((point) => normalizePoint(point)) as ActivityAreaPoint[]
  const [firstLng, firstLat] = normalized[0]
  const [lastLng, lastLat] = normalized[normalized.length - 1]
  if (firstLng === lastLng && firstLat === lastLat) return normalized
  return [...normalized, [firstLng, firstLat]]
}

export function toActivityAreaGeometry(points: ActivityAreaPoint[]): ActivityAreaGeometry | null {
  if (!isValidActivityArea(points)) return null
  return {
    type: "Polygon",
    coordinates: [closeActivityAreaRing(points)],
  }
}

function projectToMercator([lng, lat]: ActivityAreaPoint): [number, number] {
  const lonRad = (lng * Math.PI) / 180
  const latClamped = Math.max(-85, Math.min(85, lat))
  const latRad = (latClamped * Math.PI) / 180
  return [
    EARTH_RADIUS_METERS * lonRad,
    EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latRad / 2)),
  ]
}

export function summarizeActivityArea(points: ActivityAreaPoint[]): ActivityAreaSummary | null {
  if (!isValidActivityArea(points)) return null

  const ring = closeActivityAreaRing(points)
  const mercator = ring.map((point) => projectToMercator(point))

  let areaTwice = 0
  let centroidX = 0
  let centroidY = 0

  for (let index = 0; index < mercator.length - 1; index += 1) {
    const [x1, y1] = mercator[index]
    const [x2, y2] = mercator[index + 1]
    const cross = x1 * y2 - x2 * y1
    areaTwice += cross
    centroidX += (x1 + x2) * cross
    centroidY += (y1 + y2) * cross
  }

  const signedArea = areaTwice / 2
  const areaSquareMeters = Math.abs(signedArea)

  const pointsWithoutClosing = ring.slice(0, -1) as ActivityAreaPoint[]
  const bbox = pointsWithoutClosing.reduce(
    (acc, [lng, lat]) => ({
      minLng: Math.min(acc.minLng, lng),
      minLat: Math.min(acc.minLat, lat),
      maxLng: Math.max(acc.maxLng, lng),
      maxLat: Math.max(acc.maxLat, lat),
    }),
    {
      minLng: pointsWithoutClosing[0][0],
      minLat: pointsWithoutClosing[0][1],
      maxLng: pointsWithoutClosing[0][0],
      maxLat: pointsWithoutClosing[0][1],
    }
  )

  let centroidLng = (bbox.minLng + bbox.maxLng) / 2
  let centroidLat = (bbox.minLat + bbox.maxLat) / 2

  if (Math.abs(signedArea) > 1e-6) {
    const factor = 1 / (6 * signedArea)
    const mercatorCentroidX = centroidX * factor
    const mercatorCentroidY = centroidY * factor
    centroidLng = (mercatorCentroidX / EARTH_RADIUS_METERS) * (180 / Math.PI)
    centroidLat =
      (2 * Math.atan(Math.exp(mercatorCentroidY / EARTH_RADIUS_METERS)) - Math.PI / 2) *
      (180 / Math.PI)
  }

  return {
    areaKm2: areaSquareMeters / 1_000_000,
    vertexCount: pointsWithoutClosing.length,
    centroid: {
      lng: centroidLng,
      lat: centroidLat,
    },
    bbox,
  }
}
