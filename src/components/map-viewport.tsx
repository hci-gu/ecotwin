import mapboxgl from "mapbox-gl"
import type { ErrorEvent, MapLayerMouseEvent } from "mapbox-gl"
import type { LayersList, PickingInfo } from "@deck.gl/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/mapbox"
import { useAtomValue, useSetAtom } from "jotai"
import { useMatch } from "react-router-dom"

import {
  createBiomassH3HexagonLayer,
  createBiomassScreenGridLayer,
  formatTileLabel,
  MapboxDeckOverlay,
  MapboxTileOverlays,
  TILE_DOTS_LAYER_ID,
  TILE_HIT_AREA_LAYER_ID,
  tileCenterLngLat,
  tileCornerLngLat,
  type BiomassBounds,
  type BiomassHexDatum,
  type BiomassOverlayFrame,
  type OutlineDatum,
  type TileMarkerDatum,
  type ZoomedTileLabelDatum,
} from "@/map-layers"
import { tileSelectionCandidateFromLngLat } from "@/lib/tile-selection"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  activityAreaDrawingActiveAtom,
  activityAreaHoverPointAtom,
  activityAreaPointsAtom,
} from "@/state/activity-area-state"
import {
  tileCreationHoverCandidateAtom,
  tileCreationModeAtom,
  tileCreationSelectedCandidateAtom,
  tileCreationZoomAtom,
} from "@/state/tile-creation-state"
import {
  fetchManagementPlanByIdAtom,
  fetchTileByIdAtom,
  hoveredTileIdAtom,
  hoveredTileImageOverlayAtom,
  managementPlanByIdCacheAtom,
  managementPlansAtom,
  selectedTileIdAtom,
  simulationResultByRecordIdAtom,
  tileByIdCacheAtom,
  tilesListAtom,
} from "@/state/ecotwin-atoms"
import { biomassVisualizationAtom, simulationStepAtom } from "@/state/simulation-ui-state"
import type { ManagementPlan, Task, Tile } from "@/state/ecotwin-types"

const mapboxAccessToken =
  import.meta.env.VITE_MAPBOX_TOKEN ??
  "set-key-in-.env-file-to-use-mapbox-gl"

const mapboxToken = mapboxAccessToken.trim()
if (mapboxToken) {
  mapboxgl.accessToken = mapboxToken
}

function decodeBase64ToArrayBuffer(b64: string) {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

type SimpleViewState = {
  longitude: number
  latitude: number
  zoom: number
  bearing: number
  pitch: number
}

const INITIAL_VIEW_STATE: SimpleViewState = {
  longitude: 19.0,
  latitude: 57.4,
  zoom: 5,
  bearing: 0,
  pitch: 0,
}

function findFrameIndex(steps: number[], target: number) {
  if (!steps.length) return 0
  if (target <= steps[0]) return 0
  if (target >= steps[steps.length - 1]) return steps.length - 1
  let lo = 0
  let hi = steps.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = steps[mid]!
    if (v === target) return mid
    if (v < target) lo = mid + 1
    else hi = mid - 1
  }
  return Math.max(0, hi)
}

function taskData(task?: Task) {
  const value = task?.data
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value
}

function taskAreaGeometry(task?: Task) {
  const geometry = taskData(task)?.area
  if (!geometry || typeof geometry !== "object" || Array.isArray(geometry)) return null

  const candidate = geometry as {
    type?: unknown
    coordinates?: unknown
  }

  if (candidate.type !== "Polygon" || !Array.isArray(candidate.coordinates)) return null
  const firstRing = candidate.coordinates[0]
  if (!Array.isArray(firstRing) || firstRing.length < 4) return null

  const normalizedRing = firstRing
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null
      const lng = Number(point[0])
      const lat = Number(point[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
      return [lng, lat] as [number, number]
    })
    .filter((point): point is [number, number] => Boolean(point))

  if (normalizedRing.length < 4) return null

  return {
    type: "Polygon" as const,
    coordinates: [normalizedRing],
  }
}

function sortPlanTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const left = a.start ?? a.created ?? ""
    const right = b.start ?? b.created ?? ""
    return left.localeCompare(right)
  })
}

function getPlanTasks(plan?: ManagementPlan | null) {
  return sortPlanTasks(plan?.expand?.tasks ?? [])
}

function getPlanTile(
  plan: ManagementPlan | null | undefined,
  getTileById: (id: string | null | undefined) => Tile | null
) {
  if (!plan) return null
  return plan.expand?.tile ?? getTileById(plan.tile) ?? null
}

function isSameAreaPoint(left: readonly [number, number], right: readonly [number, number]) {
  return left[0] === right[0] && left[1] === right[1]
}

function isActivityAreaClosed(points: readonly [number, number][]) {
  if (points.length < 4) return false
  return isSameAreaPoint(points[0], points[points.length - 1])
}

export function MapViewport() {
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapStyleReady, setMapStyleReady] = useState(false)
  const [mapViewState, setMapViewState] = useState<SimpleViewState>(INITIAL_VIEW_STATE)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const biomassVisualization = useAtomValue(biomassVisualizationAtom)
  const setBiomassVisualization = useSetAtom(biomassVisualizationAtom)
  const tiles = useAtomValue(tilesListAtom)
  const tileByIdCache = useAtomValue(tileByIdCacheAtom)
  const managementPlans = useAtomValue(managementPlansAtom)
  const managementPlanByIdCache = useAtomValue(managementPlanByIdCacheAtom)
  const fetchManagementPlanById = useSetAtom(fetchManagementPlanByIdAtom)
  const hoveredTileId = useAtomValue(hoveredTileIdAtom)
  const setHoveredTileId = useSetAtom(hoveredTileIdAtom)
  const selectedTileId = useAtomValue(selectedTileIdAtom)
  const setSelectedTileId = useSetAtom(selectedTileIdAtom)
  const hoveredImageOverlay = useAtomValue(hoveredTileImageOverlayAtom)
  const simulationResultByRecordId = useAtomValue(simulationResultByRecordIdAtom)
  const simulationStep = useAtomValue(simulationStepAtom)
  const fetchTileById = useSetAtom(fetchTileByIdAtom)
  const tileCreationMode = useAtomValue(tileCreationModeAtom)
  const tileCreationHoverCandidate = useAtomValue(tileCreationHoverCandidateAtom)
  const tileCreationSelectedCandidate = useAtomValue(tileCreationSelectedCandidateAtom)
  const tileCreationZoom = useAtomValue(tileCreationZoomAtom)
  const setTileCreationHoverCandidate = useSetAtom(tileCreationHoverCandidateAtom)
  const setTileCreationSelectedCandidate = useSetAtom(tileCreationSelectedCandidateAtom)
  const activityAreaDrawingActive = useAtomValue(activityAreaDrawingActiveAtom)
  const activityAreaPoints = useAtomValue(activityAreaPointsAtom)
  const activityAreaHoverPoint = useAtomValue(activityAreaHoverPointAtom)
  const setActivityAreaPoints = useSetAtom(activityAreaPointsAtom)
  const setActivityAreaHoverPoint = useSetAtom(activityAreaHoverPointAtom)

  const token = mapboxToken || undefined
  const mapRef = useRef<MapRef | null>(null)

  const tileRouteMatch = useMatch("/tile/:tileId/*")
  const simulationRouteMatch = useMatch("/tile/:tileId/simulation/:simulationId")
  const managementPlanRouteMatch = useMatch("/management-plans/:planId")
  const routeTileId = tileRouteMatch?.params?.tileId
  const routeSimulationId = simulationRouteMatch?.params?.simulationId
  const routeManagementPlanId = managementPlanRouteMatch?.params?.planId
  const isTileRoute = Boolean(tileRouteMatch)
  const isSimulationRoute = Boolean(routeTileId && routeSimulationId)
  const isManagementPlanRoute = Boolean(routeManagementPlanId)
  const lastRouteZoomedTileIdRef = useRef<string | null>(null)
  const lastRouteZoomedManagementPlanIdRef = useRef<string | null>(null)

  let webglSupported = true
  try {
    webglSupported = mapboxgl.supported()
  } catch {
    webglSupported = true
  }

  const tileMarkers = useMemo<TileMarkerDatum[]>(() => {
    if (!tiles?.items?.length) return []
    return tiles.items.map((tile) => {
      const { lng, lat } = tileCenterLngLat(tile.x, tile.y, tile.zoom)
      return { tile, lng, lat, label: formatTileLabel(tile.name) }
    })
  }, [tiles])

  const getTileById = useCallback(
    (id: string | null | undefined) => {
      if (!id) return null
      const fromList = tiles?.items?.find((t) => t.id === id) ?? null
      return fromList ?? tileByIdCache[id] ?? null
    },
    [tileByIdCache, tiles?.items]
  )

  const visibleTileMarkers = useMemo(() => {
    if (!tileMarkers.length) return tileMarkers
    if (!isTileRoute || !routeTileId) return tileMarkers
    return tileMarkers.filter(({ tile }) => tile.id !== routeTileId)
  }, [isTileRoute, routeTileId, tileMarkers])

  const activeManagementPlan = useMemo(() => {
    if (!routeManagementPlanId) return null
    return (
      managementPlans?.find((plan) => plan.id === routeManagementPlanId) ??
      managementPlanByIdCache[routeManagementPlanId] ??
      null
    )
  }, [managementPlanByIdCache, managementPlans, routeManagementPlanId])

  const activeManagementPlanTasks = useMemo(
    () => getPlanTasks(activeManagementPlan),
    [activeManagementPlan]
  )
  const activeManagementPlanTile = useMemo(
    () => getPlanTile(activeManagementPlan, getTileById),
    [activeManagementPlan, getTileById]
  )
  const activeManagementPlanBounds = useMemo<mapboxgl.LngLatBoundsLike | null>(() => {
    if (!activeManagementPlanTile) return null

    const topLeft = tileCornerLngLat(
      activeManagementPlanTile.x,
      activeManagementPlanTile.y,
      activeManagementPlanTile.zoom
    )
    const bottomRight = tileCornerLngLat(
      activeManagementPlanTile.x + 1,
      activeManagementPlanTile.y + 1,
      activeManagementPlanTile.zoom
    )

    return [
      [topLeft.lng, bottomRight.lat],
      [bottomRight.lng, topLeft.lat],
    ]
  }, [activeManagementPlanTile])

  const activeOutlineTileId =
    hoveredTileId ??
    selectedTileId ??
    (isManagementPlanRoute ? activeManagementPlanTile?.id ?? null : null)

  const tileCreationHoverGeoJson = useMemo(() => {
    if (!tileCreationMode || !tileCreationHoverCandidate) return null
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "Polygon" as const,
            coordinates: [tileCreationHoverCandidate.polygon],
          },
          properties: {},
        },
      ],
    }
  }, [tileCreationHoverCandidate, tileCreationMode])

  const tileCreationSelectedGeoJson = useMemo(() => {
    if (!tileCreationMode || !tileCreationSelectedCandidate) return null
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "Polygon" as const,
            coordinates: [tileCreationSelectedCandidate.polygon],
          },
          properties: {},
        },
      ],
    }
  }, [tileCreationMode, tileCreationSelectedCandidate])

  useEffect(() => {
    if (!routeManagementPlanId) return
    const cachedPlan =
      managementPlans?.find((plan) => plan.id === routeManagementPlanId) ??
      managementPlanByIdCache[routeManagementPlanId] ??
      null
    if (cachedPlan?.expand?.tile || !cachedPlan) {
      if (!cachedPlan) {
        void fetchManagementPlanById({ id: routeManagementPlanId }).catch(() => {})
      }
      return
    }

    void fetchManagementPlanById({ id: routeManagementPlanId }).catch(() => {})
  }, [fetchManagementPlanById, managementPlanByIdCache, managementPlans, routeManagementPlanId])

  useEffect(() => {
    if (tileCreationMode) return
    setTileCreationHoverCandidate(null)
    setTileCreationSelectedCandidate(null)
  }, [setTileCreationHoverCandidate, setTileCreationSelectedCandidate, tileCreationMode])

  useEffect(() => {
    if (!isManagementPlanRoute) return
    if (!activeManagementPlan?.tile || activeManagementPlanTile) return
    void fetchTileById({ id: activeManagementPlan.tile }).catch(() => {})
  }, [activeManagementPlan?.tile, activeManagementPlanTile, fetchTileById, isManagementPlanRoute])

  const biomassBase = useMemo(() => {
    if (!routeTileId || !routeSimulationId) return null
    const result = simulationResultByRecordId[routeSimulationId]
    if (!result) return null
    const tile = getTileById(routeTileId)
    if (!tile) return null

    const shape = result.shape
    if (!Array.isArray(shape) || shape.length !== 4) return null
    const [n, h, w, s] = shape.map((v) => Number(v))
    if (![n, h, w, s].every((v) => Number.isFinite(v) && v > 0)) return null

    const steps =
      Array.isArray(result.steps) && result.steps.length === n
        ? result.steps.map((v) => Number(v))
        : Array.from({ length: n }, (_, i) => i)

    const buffer = decodeBase64ToArrayBuffer(result.biomass_b64)
    const data = new Float32Array(buffer)
    const expected = n * h * w * s
    if (data.length < expected) return null

    const topLeft = tileCornerLngLat(tile.x, tile.y, tile.zoom)
    const bottomRight = tileCornerLngLat(tile.x + 1, tile.y + 1, tile.zoom)

    const bounds: BiomassBounds = {
      lngMin: topLeft.lng,
      lngMax: bottomRight.lng,
      latMin: bottomRight.lat,
      latMax: topLeft.lat,
    }

    return { data, steps, h, w, s, bounds }
  }, [getTileById, routeSimulationId, routeTileId, simulationResultByRecordId])

  const biomassOverlay = useMemo<BiomassOverlayFrame | null>(() => {
    if (!biomassBase) return null
    const frame = findFrameIndex(
      biomassBase.steps,
      Math.max(0, Math.floor(simulationStep))
    )
    return { ...biomassBase, frame }
  }, [biomassBase, simulationStep])

  useEffect(() => {
    if (!routeTileId) {
      lastRouteZoomedTileIdRef.current = null
      return
    }

    if (!mapLoaded) return
    if (lastRouteZoomedTileIdRef.current === routeTileId) return

    const tile = getTileById(routeTileId)
    if (!tile) return

    const mapRefValue = mapRef.current
    if (!mapRefValue) return
    const map = mapRefValue.getMap?.()
    if (!map) return

    let canceled = false
    let retryTimer: number | null = null
    const topLeft = tileCornerLngLat(tile.x, tile.y, tile.zoom)
    const bottomRight = tileCornerLngLat(tile.x + 1, tile.y + 1, tile.zoom)
    const bounds: mapboxgl.LngLatBoundsLike = [
      [topLeft.lng, bottomRight.lat],
      [bottomRight.lng, topLeft.lat],
    ]

    const attemptZoom = () => {
      if (canceled) return
      if (lastRouteZoomedTileIdRef.current === routeTileId) return
      try {
        if (!map.isStyleLoaded?.() || !map.loaded?.()) {
          retryTimer = window.setTimeout(attemptZoom, 120)
          return
        }
        mapRefValue.fitBounds(bounds, {
          padding: 80,
          duration: 800,
        })
        lastRouteZoomedTileIdRef.current = routeTileId
      } catch (err) {
        retryTimer = window.setTimeout(attemptZoom, 120)
      }
    }

    attemptZoom()

    return () => {
      canceled = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [getTileById, mapLoaded, routeTileId])

  useEffect(() => {
    if (!isManagementPlanRoute || !routeManagementPlanId) {
      lastRouteZoomedManagementPlanIdRef.current = null
      return
    }

    if (!mapLoaded || !activeManagementPlanBounds) return
    if (lastRouteZoomedManagementPlanIdRef.current === routeManagementPlanId) return

    const mapRefValue = mapRef.current
    if (!mapRefValue) return
    const map = mapRefValue.getMap?.()
    if (!map) return

    let canceled = false
    let retryTimer: number | null = null
    const attemptZoom = () => {
      if (canceled) return
      if (lastRouteZoomedManagementPlanIdRef.current === routeManagementPlanId) return
      try {
        if (!map.isStyleLoaded?.() || !map.loaded?.()) {
          retryTimer = window.setTimeout(attemptZoom, 120)
          return
        }
        const container = map.getContainer?.()
        const containerWidth = container?.clientWidth ?? window.innerWidth
        mapRefValue.fitBounds(activeManagementPlanBounds, {
          padding: {
            top: 72,
            right: Math.max(72, Math.floor(containerWidth * 0.5) + 24),
            bottom: 72,
            left: 72,
          },
          duration: 800,
        })
        lastRouteZoomedManagementPlanIdRef.current = routeManagementPlanId
      } catch (err) {
        retryTimer = window.setTimeout(attemptZoom, 120)
      }
    }

    attemptZoom()

    return () => {
      canceled = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [activeManagementPlanBounds, isManagementPlanRoute, mapLoaded, routeManagementPlanId])

  const hoveredImageOverlaySource = useMemo(() => {
    if (!hoveredImageOverlay) return null
    const tile = getTileById(hoveredImageOverlay.tileId)
    if (!tile) return null

    const topLeft = tileCornerLngLat(tile.x, tile.y, tile.zoom)
    const bottomRight = tileCornerLngLat(tile.x + 1, tile.y + 1, tile.zoom)
    const topRight = { lng: bottomRight.lng, lat: topLeft.lat }
    const bottomLeft = { lng: topLeft.lng, lat: bottomRight.lat }

    const coordinates: mapboxgl.ImageSourceSpecification["coordinates"] = [
      [topLeft.lng, topLeft.lat],
      [topRight.lng, topRight.lat],
      [bottomRight.lng, bottomRight.lat],
      [bottomLeft.lng, bottomLeft.lat],
    ]

    return {
      url: hoveredImageOverlay.url,
      opacity: hoveredImageOverlay.opacity ?? 0.8,
      resampling: hoveredImageOverlay.resampling ?? "linear",
      coordinates,
    }
  }, [getTileById, hoveredImageOverlay])

  const activeOutlinePolygon = useMemo<OutlineDatum | null>(() => {
    if (!activeOutlineTileId) return null
    const tile = getTileById(activeOutlineTileId)
    if (!tile) return null

    const topLeft = tileCornerLngLat(tile.x, tile.y, tile.zoom)
    const bottomRight = tileCornerLngLat(tile.x + 1, tile.y + 1, tile.zoom)
    const topRight = { lng: bottomRight.lng, lat: topLeft.lat }
    const bottomLeft = { lng: topLeft.lng, lat: bottomRight.lat }

    const polygon: [number, number][] = [
      [topLeft.lng, topLeft.lat],
      [topRight.lng, topRight.lat],
      [bottomRight.lng, bottomRight.lat],
      [bottomLeft.lng, bottomLeft.lat],
      [topLeft.lng, topLeft.lat],
    ]

    return { tile, polygon }
  }, [activeOutlineTileId, getTileById])

  const zoomedTileLabel = useMemo<ZoomedTileLabelDatum | null>(() => {
    if (!isTileRoute || !routeTileId) return null
    const tile = getTileById(routeTileId)
    if (!tile) return null
    const topLeft = tileCornerLngLat(tile.x, tile.y, tile.zoom)
    return {
      tile,
      lng: topLeft.lng,
      lat: topLeft.lat,
      label: formatTileLabel(tile.name),
    }
  }, [getTileById, isTileRoute, routeTileId])

  const savedActivityAreaGeoJson = useMemo(() => {
    if (!isManagementPlanRoute || !activeManagementPlanTasks.length) return null

    const features = activeManagementPlanTasks
      .map((task) => {
        const geometry = taskAreaGeometry(task)
        if (!geometry) return null
        return {
          type: "Feature" as const,
          properties: {
            taskId: task.id,
            taskName: task.name || "Untitled activity",
            taskType: task.type,
            areaColor:
              task.type === "hunting"
                ? "#ef4444"
                : task.type === "forestry"
                  ? "#f59e0b"
                  : task.type === "infrastructure"
                    ? "#eab308"
                    : "#64748b",
          },
          geometry,
        }
      })
      .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature))

    if (!features.length) return null

    return {
      type: "FeatureCollection" as const,
      features,
    }
  }, [activeManagementPlanTasks, isManagementPlanRoute])

  const savedActivityAreaLabelsGeoJson = useMemo(() => {
    if (!isManagementPlanRoute || !activeManagementPlanTasks.length) return null

    const features = activeManagementPlanTasks
      .map((task) => {
        const summary = taskData(task)?.areaSummary
        const centroid = summary?.centroid
        if (
          !centroid ||
          typeof centroid.lng !== "number" ||
          !Number.isFinite(centroid.lng) ||
          typeof centroid.lat !== "number" ||
          !Number.isFinite(centroid.lat)
        ) {
          return null
        }

        return {
          type: "Feature" as const,
          properties: {
            label: task.name || "Untitled activity",
          },
          geometry: {
            type: "Point" as const,
            coordinates: [centroid.lng, centroid.lat] as [number, number],
          },
        }
      })
      .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature))

    if (!features.length) return null

    return {
      type: "FeatureCollection" as const,
      features,
    }
  }, [activeManagementPlanTasks, isManagementPlanRoute])

  const draftActivityAreaFillGeoJson = useMemo(() => {
    if (!activityAreaDrawingActive || activityAreaPoints.length < 3) return null
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Polygon" as const,
            coordinates: [[...activityAreaPoints, activityAreaPoints[0]]],
          },
        },
      ],
    }
  }, [activityAreaDrawingActive, activityAreaPoints])

  const draftActivityAreaLineGeoJson = useMemo(() => {
    if (!activityAreaDrawingActive || !activityAreaPoints.length) return null

    const coordinates = [...activityAreaPoints]
    if (activityAreaHoverPoint) {
      coordinates.push(activityAreaHoverPoint)
    }
    if (coordinates.length < 2) return null

    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates,
          },
        },
      ],
    }
  }, [activityAreaDrawingActive, activityAreaHoverPoint, activityAreaPoints])

  const draftActivityAreaPointsGeoJson = useMemo(() => {
    if (!activityAreaDrawingActive || !activityAreaPoints.length) return null
    return {
      type: "FeatureCollection" as const,
      features: activityAreaPoints.map((point, index) => ({
        type: "Feature" as const,
        properties: {
          index: index + 1,
        },
        geometry: {
          type: "Point" as const,
          coordinates: point,
        },
      })),
    }
  }, [activityAreaDrawingActive, activityAreaPoints])

  const deckLayers = useMemo<LayersList>(() => {
    const layers: LayersList = []

    const biomassLayer =
      biomassVisualization === "h3Hexagon"
        ? createBiomassH3HexagonLayer(biomassOverlay, mapViewState.zoom)
        : createBiomassScreenGridLayer(biomassOverlay)
    if (biomassLayer) {
      layers.push(
        biomassLayer.clone({
          // @ts-expect-error MapboxOverlay supports `beforeId` (used when interleaved: true)
          beforeId: TILE_HIT_AREA_LAYER_ID,
        })
      )
    }

    return layers
  }, [
    biomassOverlay,
    biomassVisualization,
    mapViewState.zoom,
  ])

  const getTooltipText = useCallback((info: PickingInfo) => {
    if (info.layer?.id === "biomass-screen-grid") {
      const obj = info.object as { value?: number; count?: number } | null
      const v = obj?.value
      const c = obj?.count
      if (typeof v !== "number") return null
      const countLabel = typeof c === "number" ? ` (${c})` : ""
      return `Biomass: ${v.toFixed(2)}${countLabel}`
    }

    if (info.layer?.id === "biomass-h3-hex") {
      const obj = info.object as BiomassHexDatum | null
      if (!obj) return null
      return `${obj.hex} biomass: ${obj.count.toFixed(2)}`
    }

    return null
  }, [])

  const onDeckHover = useCallback(
    (info: PickingInfo) => {
      const text = getTooltipText(info)
      if (!text) {
        setTooltip(null)
        return
      }
      if (typeof info.x !== "number" || typeof info.y !== "number") {
        setTooltip(null)
        return
      }
      setTooltip({ x: info.x, y: info.y, text })
    },
    [getTooltipText]
  )

  const overlayProps = useMemo(
    () => ({
      interleaved: true,
      layers: deckLayers,
      onHover: onDeckHover,
    }),
    [deckLayers, onDeckHover]
  )

  useEffect(() => {
    if (!mapLoaded) {
      setMapStyleReady(false)
      return
    }

    const map = mapRef.current?.getMap?.()
    if (!map) {
      setMapStyleReady(false)
      return
    }

    const updateStyleReady = () => {
      setMapStyleReady(map.isStyleLoaded?.() ?? false)
    }
    const markStyleLoading = () => {
      setMapStyleReady(false)
    }

    updateStyleReady()
    map.on("styledataloading", markStyleLoading)
    map.on("styledata", updateStyleReady)
    map.on("idle", updateStyleReady)

    return () => {
      map.off("styledataloading", markStyleLoading)
      map.off("styledata", updateStyleReady)
      map.off("idle", updateStyleReady)
    }
  }, [mapLoaded])

  useEffect(() => {
    if (!isSimulationRoute) return
    if (!mapLoaded) return

    const map = mapRef.current?.getMap?.()
    if (!map) return

    const targetPitch = biomassVisualization === "h3Hexagon" ? 55 : 0
    const currentPitch = map.getPitch?.() ?? 0
    if (Math.abs(currentPitch - targetPitch) < 0.5) return

    map.easeTo({
      pitch: targetPitch,
      duration: 900,
      easing: (t) => t * t * (3 - 2 * t),
    })
  }, [biomassVisualization, isSimulationRoute, mapLoaded])

  const onBiomassVisualizationChange = useCallback(
    (value: string) => {
      if (value === "screenGrid" || value === "h3Hexagon") {
        setBiomassVisualization(value)
      }
    },
    [setBiomassVisualization]
  )

  const onMove = useCallback((evt: ViewStateChangeEvent) => {
    const vs = evt.viewState
    setMapViewState({
      longitude: vs.longitude,
      latitude: vs.latitude,
      zoom: vs.zoom,
      bearing: vs.bearing,
      pitch: vs.pitch,
    })
  }, [])

  const onTileMouseMove = useCallback(
    (evt: MapLayerMouseEvent) => {
      if (tileCreationMode && !isTileRoute && !isManagementPlanRoute) {
        setHoveredTileId(null)
        setTileCreationHoverCandidate(
          tileSelectionCandidateFromLngLat(evt.lngLat.lng, evt.lngLat.lat, tileCreationZoom)
        )
        return
      }

      if (activityAreaDrawingActive) {
        setHoveredTileId(null)
        if (isActivityAreaClosed(activityAreaPoints)) {
          setActivityAreaHoverPoint(null)
          return
        }
        setActivityAreaHoverPoint([evt.lngLat.lng, evt.lngLat.lat])
        return
      }

      const f = evt.features?.[0]
      const id = f?.properties?.tileId
      setHoveredTileId(typeof id === "string" ? id : null)
    },
    [
      activityAreaDrawingActive,
      activityAreaPoints,
      isManagementPlanRoute,
      isTileRoute,
      setActivityAreaHoverPoint,
      setHoveredTileId,
      setTileCreationHoverCandidate,
      tileCreationMode,
      tileCreationZoom,
    ]
  )

  const onTileClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      if (tileCreationMode && !isTileRoute && !isManagementPlanRoute) {
        setSelectedTileId(null)
        setTileCreationSelectedCandidate(
          tileSelectionCandidateFromLngLat(evt.lngLat.lng, evt.lngLat.lat, tileCreationZoom)
        )
        return
      }

      if (activityAreaDrawingActive) {
        const clickPoint: [number, number] = [evt.lngLat.lng, evt.lngLat.lat]
        setActivityAreaPoints((prev) => {
          if (isActivityAreaClosed(prev)) return prev
          if (prev.length >= 3) {
            const map = mapRef.current?.getMap?.()
            const firstPoint = prev[0]
            if (map && firstPoint) {
              const projectedFirst = map.project(firstPoint)
              const projectedClick = map.project(clickPoint)
              const distance = Math.hypot(
                projectedClick.x - projectedFirst.x,
                projectedClick.y - projectedFirst.y
              )
              if (distance <= 18) {
                return [...prev, firstPoint]
              }
            }
          }
          return [...prev, clickPoint]
        })
        return
      }

      const f = evt.features?.[0]
      const id = f?.properties?.tileId
      if (typeof id === "string") setSelectedTileId(id)
    },
    [
      activityAreaDrawingActive,
      isManagementPlanRoute,
      isTileRoute,
      setActivityAreaPoints,
      setSelectedTileId,
      setTileCreationSelectedCandidate,
      tileCreationMode,
      tileCreationZoom,
    ]
  )

  const mapStyleContent = mapLoaded && mapStyleReady

  return (
    <div className="absolute inset-0">
      {webglSupported ? (
        <>
          <Map
            ref={mapRef}
            mapboxAccessToken={token}
            mapLib={mapboxgl}
            projection={{ name: "globe" }}
            initialViewState={INITIAL_VIEW_STATE}
            onMove={onMove}
            onMouseMove={onTileMouseMove}
            onClick={onTileClick}
            interactiveLayerIds={[TILE_HIT_AREA_LAYER_ID, TILE_DOTS_LAYER_ID]}
            scrollZoom={!isTileRoute}
            dragPan={!isTileRoute}
            dragRotate={!isTileRoute}
            doubleClickZoom={!isTileRoute && !activityAreaDrawingActive}
            touchZoomRotate={!isTileRoute}
            keyboard={!isTileRoute}
            cursor={
              tileCreationMode && !isTileRoute && !isManagementPlanRoute
                ? "crosshair"
                : activityAreaDrawingActive
                ? "crosshair"
                : hoveredTileId
                  ? "pointer"
                  : isTileRoute
                    ? "default"
                    : "grab"
            }
            mapStyle="mapbox://styles/sebastianait/cmj9rorhf004b01s9fj9m1ynh"
            attributionControl={false}
            style={{ width: "100%", height: "100%" }}
            onLoad={() => {
              setMapLoaded(true)
              const map = mapRef.current?.getMap?.()
              setMapStyleReady(map?.isStyleLoaded?.() ?? false)
            }}
            onError={(e: ErrorEvent) => {
              const message = e.error?.message ?? "Map error (check console for details)"
              setMapError(message)
              console.error(e.error ?? e)
            }}
          >
            {mapStyleContent ? (
              <>
                {hoveredImageOverlaySource ? (
                  <Source
                    id="hovered-tile-image"
                    type="image"
                    url={hoveredImageOverlaySource.url}
                    coordinates={hoveredImageOverlaySource.coordinates}
                  >
                    <Layer
                      id="hovered-tile-image-layer"
                      type="raster"
                      paint={{
                        "raster-opacity": hoveredImageOverlaySource.opacity,
                        "raster-resampling": hoveredImageOverlaySource.resampling,
                      }}
                    />
                  </Source>
                ) : null}

                <MapboxTileOverlays
                  visibleTileMarkers={visibleTileMarkers}
                  hoveredTileId={hoveredTileId}
                  selectedTileId={selectedTileId}
                  activeOutlinePolygon={activeOutlinePolygon}
                  zoomedTileLabel={zoomedTileLabel}
                />

                {tileCreationHoverGeoJson ? (
                  <Source id="tile-creation-hover" type="geojson" data={tileCreationHoverGeoJson}>
                    <Layer
                      id="tile-creation-hover-fill"
                      type="fill"
                      paint={{
                        "fill-color": "#1d4ed8",
                        "fill-opacity": 0.08,
                      }}
                    />
                    <Layer
                      id="tile-creation-hover-line"
                      type="line"
                      paint={{
                        "line-color": "#1d4ed8",
                        "line-width": 2,
                        "line-dasharray": [2, 1],
                      }}
                    />
                  </Source>
                ) : null}

                {tileCreationSelectedGeoJson ? (
                  <Source id="tile-creation-selected" type="geojson" data={tileCreationSelectedGeoJson}>
                    <Layer
                      id="tile-creation-selected-fill"
                      type="fill"
                      paint={{
                        "fill-color": "#14532d",
                        "fill-opacity": 0.12,
                      }}
                    />
                    <Layer
                      id="tile-creation-selected-line"
                      type="line"
                      paint={{
                        "line-color": "#14532d",
                        "line-width": 3,
                      }}
                    />
                  </Source>
                ) : null}

                {savedActivityAreaGeoJson ? (
                  <Source id="saved-activity-areas" type="geojson" data={savedActivityAreaGeoJson}>
                    <Layer
                      id="saved-activity-areas-fill"
                      type="fill"
                      paint={{
                        "fill-color": ["get", "areaColor"],
                        "fill-opacity": 0.15,
                      }}
                    />
                    <Layer
                      id="saved-activity-areas-line"
                      type="line"
                      paint={{
                        "line-color": ["get", "areaColor"],
                        "line-width": 2,
                      }}
                    />
                  </Source>
                ) : null}

                {savedActivityAreaLabelsGeoJson ? (
                  <Source id="saved-activity-area-labels" type="geojson" data={savedActivityAreaLabelsGeoJson}>
                    <Layer
                      id="saved-activity-area-labels-layer"
                      type="symbol"
                      layout={{
                        "text-field": ["get", "label"],
                        "text-size": 12,
                        "text-offset": [0, -1.2],
                        "text-anchor": "bottom",
                      }}
                      paint={{
                        "text-color": "#3f3f46",
                        "text-halo-color": "#ffffff",
                        "text-halo-width": 1.25,
                      }}
                    />
                  </Source>
                ) : null}

                {draftActivityAreaFillGeoJson ? (
                  <Source id="draft-activity-area-fill" type="geojson" data={draftActivityAreaFillGeoJson}>
                    <Layer
                      id="draft-activity-area-fill-layer"
                      type="fill"
                      paint={{
                        "fill-color": "#4f7865",
                        "fill-opacity": 0.22,
                      }}
                    />
                  </Source>
                ) : null}

                {draftActivityAreaLineGeoJson ? (
                  <Source id="draft-activity-area-line" type="geojson" data={draftActivityAreaLineGeoJson}>
                    <Layer
                      id="draft-activity-area-line-layer"
                      type="line"
                      paint={{
                        "line-color": "#4f7865",
                        "line-width": 3,
                        "line-dasharray": [1.4, 1],
                      }}
                    />
                  </Source>
                ) : null}

                {draftActivityAreaPointsGeoJson ? (
                  <Source id="draft-activity-area-points" type="geojson" data={draftActivityAreaPointsGeoJson}>
                    <Layer
                      id="draft-activity-area-points-layer"
                      type="circle"
                      paint={{
                        "circle-radius": 5,
                        "circle-color": "#ffffff",
                        "circle-stroke-color": "#4f7865",
                        "circle-stroke-width": 2,
                      }}
                    />
                  </Source>
                ) : null}

                <MapboxDeckOverlay
                  key={overlayProps.interleaved ? "deck-interleaved" : "deck-overlaid"}
                  {...overlayProps}
                />
              </>
            ) : null}

            {!isTileRoute ? (
              <NavigationControl position="bottom-right" showCompass={false} />
            ) : null}
          </Map>

          {tooltip ? (
            <div
              className="pointer-events-none absolute z-30 rounded-md bg-zinc-900/95 px-2 py-1 text-[11px] font-medium text-white shadow-sm"
              style={{
                left: tooltip.x + 12,
                top: tooltip.y + 12,
                maxWidth: "min(360px, 90vw)",
              }}
            >
              {tooltip.text}
            </div>
          ) : null}

          {isSimulationRoute ? (
            <div className="pointer-events-auto absolute left-4 top-4 z-20 rounded-md bg-white/90 px-3 py-2 shadow-sm ring-1 ring-black/10 backdrop-blur">
              <div className="text-[11px] font-semibold text-zinc-900">
                Biomass visualization
              </div>
              <div className="mt-1">
                <Select
                  value={biomassVisualization}
                  onValueChange={onBiomassVisualizationChange}
                >
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue placeholder="Select view" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectGroup>
                      <SelectItem value="screenGrid">Screen grid</SelectItem>
                      <SelectItem value="h3Hexagon">Hexagons</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid h-full w-full place-items-center bg-white text-sm text-zinc-700">
          WebGL not available, map cannot render.
        </div>
      )}

      {mapError ? (
        <div className="absolute right-4 top-4 z-20 max-w-[min(520px,90vw)] rounded-md bg-white/95 px-3 py-2 text-sm text-zinc-900 shadow-sm">
          {mapError}
        </div>
      ) : null}
    </div>
  )
}
