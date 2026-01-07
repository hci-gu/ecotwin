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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  hoveredTileIdAtom,
  hoveredTileImageOverlayAtom,
  selectedTileIdAtom,
  simulationResultByRecordIdAtom,
  tileByIdCacheAtom,
  tilesListAtom,
} from "@/state/ecotwin-atoms"
import { biomassVisualizationAtom, simulationStepAtom } from "@/state/simulation-ui-state"

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

export function MapViewport() {
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapViewState, setMapViewState] = useState<SimpleViewState>(INITIAL_VIEW_STATE)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const biomassVisualization = useAtomValue(biomassVisualizationAtom)
  const setBiomassVisualization = useSetAtom(biomassVisualizationAtom)
  const tiles = useAtomValue(tilesListAtom)
  const tileByIdCache = useAtomValue(tileByIdCacheAtom)
  const hoveredTileId = useAtomValue(hoveredTileIdAtom)
  const setHoveredTileId = useSetAtom(hoveredTileIdAtom)
  const selectedTileId = useAtomValue(selectedTileIdAtom)
  const setSelectedTileId = useSetAtom(selectedTileIdAtom)
  const hoveredImageOverlay = useAtomValue(hoveredTileImageOverlayAtom)
  const simulationResultByRecordId = useAtomValue(simulationResultByRecordIdAtom)
  const simulationStep = useAtomValue(simulationStepAtom)

  const token = mapboxToken || undefined
  const mapRef = useRef<MapRef | null>(null)

  const tileRouteMatch = useMatch("/tile/:tileId/*")
  const simulationRouteMatch = useMatch("/tile/:tileId/simulation/:simulationId")
  const routeTileId = tileRouteMatch?.params?.tileId
  const routeSimulationId = simulationRouteMatch?.params?.simulationId
  const isTileRoute = Boolean(tileRouteMatch)
  const isSimulationRoute = Boolean(routeTileId && routeSimulationId)
  const lastRouteZoomedTileIdRef = useRef<string | null>(null)

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

  const activeOutlineTileId = hoveredTileId ?? selectedTileId

  const visibleTileMarkers = useMemo(() => {
    if (!tileMarkers.length) return tileMarkers
    if (!isTileRoute || !routeTileId) return tileMarkers
    return tileMarkers.filter(({ tile }) => tile.id !== routeTileId)
  }, [isTileRoute, routeTileId, tileMarkers])

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
        if (!map.isStyleLoaded?.() || !map.loaded?.()) return
        mapRefValue.fitBounds(bounds, {
          padding: 80,
          duration: 800,
        })
        lastRouteZoomedTileIdRef.current = routeTileId
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!message.toLowerCase().includes("style is not done loading")) {
          console.error(err)
        }
      }
    }

    map.on("idle", attemptZoom)
    attemptZoom()

    return () => {
      canceled = true
      map.off("idle", attemptZoom)
    }
  }, [getTileById, mapLoaded, routeTileId])

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
      const f = evt.features?.[0]
      const id = f?.properties?.tileId
      setHoveredTileId(typeof id === "string" ? id : null)
    },
    [setHoveredTileId]
  )

  const onTileClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      const f = evt.features?.[0]
      const id = f?.properties?.tileId
      if (typeof id === "string") setSelectedTileId(id)
    },
    [setSelectedTileId]
  )

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
            doubleClickZoom={!isTileRoute}
            touchZoomRotate={!isTileRoute}
            keyboard={!isTileRoute}
            cursor={
              hoveredTileId ? "pointer" : isTileRoute ? "default" : "grab"
            }
            mapStyle="mapbox://styles/sebastianait/cmj9rorhf004b01s9fj9m1ynh"
            attributionControl={false}
            style={{ width: "100%", height: "100%" }}
            onLoad={() => setMapLoaded(true)}
            onError={(e: ErrorEvent) => {
              const message = e.error?.message ?? "Map error (check console for details)"
              setMapError(message)
              console.error(e.error ?? e)
            }}
          >
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

            <MapboxDeckOverlay
              key={overlayProps.interleaved ? "deck-interleaved" : "deck-overlaid"}
              {...overlayProps}
            />

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
