import mapboxgl from "mapbox-gl"
import type { ErrorEvent } from "mapbox-gl"
import {
  FlyToInterpolator,
  type LayersList,
  type MapViewState,
  WebMercatorViewport,
} from "@deck.gl/core"
import { PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers"
import DeckGL, { ZoomWidget } from "@deck.gl/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Map, { Layer, Source, type MapRef } from "react-map-gl/mapbox"
import { useAtomValue, useSetAtom } from "jotai"
import { useMatch } from "react-router-dom"

import {
  hoveredTileIdAtom,
  hoveredTileImageOverlayAtom,
  selectedTileIdAtom,
  simulationResultByRecordIdAtom,
  tileByIdCacheAtom,
  tilesListAtom,
} from "@/state/ecotwin-atoms"
import type { Tile } from "@/state/ecotwin-types"
import { simulationStepAtom } from "@/state/simulation-ui-state"

const mapboxAccessToken =
  import.meta.env.VITE_MAPBOX_TOKEN ??
  "set-key-in-.env-file-to-use-mapbox-gl"

const mapboxToken = mapboxAccessToken.trim()
if (mapboxToken) {
  mapboxgl.accessToken = mapboxToken
}

function tileCenterLngLat(x: number, y: number, zoom: number) {
  const n = 2 ** zoom
  const lng = ((x + 0.5) / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)))
  const lat = (latRad * 180) / Math.PI
  return { lng, lat }
}

function tileCornerLngLat(x: number, y: number, zoom: number) {
  const n = 2 ** zoom
  const lng = (x / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  const lat = (latRad * 180) / Math.PI
  return { lng, lat }
}

function decodeBase64ToArrayBuffer(b64: string) {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

type EcotwinViewState = MapViewState & {
  pitch?: number
  bearing?: number
  transitionDuration?: number
  transitionInterpolator?: unknown
}

const INITIAL_VIEW_STATE: EcotwinViewState = {
  longitude: 19.0,
  latitude: 57.4,
  zoom: 5,
  pitch: 0,
  bearing: 0,
}

type TileMarkerDatum = {
  tile: Tile
  lng: number
  lat: number
  label: string
}

type ZoomedTileLabelDatum = {
  tile: Tile
  lng: number
  lat: number
  label: string
}

type OutlineDatum = {
  tile: Tile
  polygon: [number, number][]
}

const biomassPalette = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#0ea5e9",
]

function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return { r: 0, g: 0, b: 0 }
  return {
    r: Number.parseInt(m[1], 16),
    g: Number.parseInt(m[2], 16),
    b: Number.parseInt(m[3], 16),
  }
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

function formatTileLabel(name: string | undefined) {
  const label = name?.trim() || "Untitled tile"
  return label.length > 44 ? `${label.slice(0, 43)}…` : label
}

export function MapViewport() {
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [viewState, setViewState] = useState<EcotwinViewState>(INITIAL_VIEW_STATE)
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 })
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
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapRef | null>(null)
  const biomassCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const tileRouteMatch = useMatch("/tile/:tileId/*")
  const simulationRouteMatch = useMatch("/tile/:tileId/simulation/:simulationId")
  const routeTileId = tileRouteMatch?.params?.tileId
  const routeSimulationId = simulationRouteMatch?.params?.simulationId
  const isTileRoute = Boolean(tileRouteMatch)
  const lastRouteZoomedTileIdRef = useRef<string | null>(null)

  let webglSupported = true
  try {
    webglSupported = mapboxgl.supported()
  } catch {
    webglSupported = true
  }

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setViewportSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    const topRight = { lng: bottomRight.lng, lat: topLeft.lat }
    const bottomLeft = { lng: topLeft.lng, lat: bottomRight.lat }

    const coordinates: mapboxgl.ImageSourceSpecification["coordinates"] = [
      [topLeft.lng, topLeft.lat],
      [topRight.lng, topRight.lat],
      [bottomRight.lng, bottomRight.lat],
      [bottomLeft.lng, bottomLeft.lat],
    ]

    return { data, steps, h, w, s, coordinates }
  }, [getTileById, routeSimulationId, routeTileId, simulationResultByRecordId])

  const biomassOverlay = useMemo(() => {
    if (!biomassBase) return null
    const frame = findFrameIndex(
      biomassBase.steps,
      Math.max(0, Math.floor(simulationStep))
    )
    return { ...biomassBase, frame }
  }, [biomassBase, simulationStep])

  useEffect(() => {
    if (!biomassOverlay) return
    const canvas = biomassCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { data, frame, h, w, s } = biomassOverlay

    canvas.width = w
    canvas.height = h

    const pixels = new Uint8ClampedArray(w * h * 4)

    const frameOffset = frame * h * w * s
    let maxV = 0
    for (let i = 0; i < h * w * s; i++) {
      const v = data[frameOffset + i] ?? 0
      if (v > maxV) maxV = v
    }
    if (maxV <= 0) maxV = 1

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Data orientation fix:
        // The upstream biomass grid axes don't match our tile orientation.
        // Rotate 90° left and flip vertically (for square grids this is equivalent to transpose).
        const dataX = y
        const dataY = x
        const cellBase = frameOffset + (dataY * w + dataX) * s
        let bestSp = 0
        let bestV = -Infinity
        for (let sp = 0; sp < s; sp++) {
          const v = data[cellBase + sp] ?? 0
          if (v > bestV) {
            bestV = v
            bestSp = sp
          }
        }

        const rgb = hexToRgb(biomassPalette[bestSp % biomassPalette.length]!)
        const t = Math.max(0, Math.min(1, bestV / maxV))
        const r = Math.round(255 * (1 - t) + rgb.r * t)
        const g = Math.round(255 * (1 - t) + rgb.g * t)
        const b = Math.round(255 * (1 - t) + rgb.b * t)

        const p = (y * w + x) * 4
        pixels[p + 0] = r
        pixels[p + 1] = g
        pixels[p + 2] = b
        pixels[p + 3] = 255
      }
    }

    ctx.putImageData(new ImageData(pixels, w, h), 0, 0)
    mapRef.current?.getMap?.().triggerRepaint()
  }, [biomassOverlay])

  useEffect(() => {
    if (!routeTileId) {
      lastRouteZoomedTileIdRef.current = null
      return
    }

    if (!mapLoaded) return
    if (lastRouteZoomedTileIdRef.current === routeTileId) return

    const tile = getTileById(routeTileId)
    if (!tile) return

    const map = mapRef.current?.getMap?.()
    const canvas = map?.getCanvas?.()
    const width = canvas?.clientWidth ?? 0
    const height = canvas?.clientHeight ?? 0
    if (!width || !height) return

    const topLeft = tileCornerLngLat(tile.x, tile.y, tile.zoom)
    const bottomRight = tileCornerLngLat(tile.x + 1, tile.y + 1, tile.zoom)
    const bounds: [[number, number], [number, number]] = [
      [topLeft.lng, bottomRight.lat],
      [bottomRight.lng, topLeft.lat],
    ]

    const fit = new WebMercatorViewport({ width, height }).fitBounds(bounds, {
      padding: 80,
    })

    const raf = window.requestAnimationFrame(() => {
      setViewState((prev) => ({
        ...prev,
        longitude: fit.longitude,
        latitude: fit.latitude,
        zoom: fit.zoom,
        transitionDuration: 800,
        transitionInterpolator: new FlyToInterpolator(),
      }))
      lastRouteZoomedTileIdRef.current = routeTileId
    })

    return () => window.cancelAnimationFrame(raf)
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
    return { tile, lng: topLeft.lng, lat: topLeft.lat, label: formatTileLabel(tile.name) }
  }, [getTileById, isTileRoute, routeTileId])

  const deckLayers = useMemo(() => {
    const layers: LayersList = []

    if (activeOutlinePolygon) {
      layers.push(
        new PolygonLayer<OutlineDatum>({
          id: "hovered-tile-outline",
          data: [activeOutlinePolygon],
          getPolygon: (d) => d.polygon,
          filled: false,
          stroked: true,
          getLineColor: [17, 24, 39, Math.round(255 * 0.65)],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
        })
      )
    }

    layers.push(
      new ScatterplotLayer<TileMarkerDatum>({
        id: "tile-hit-area",
        data: visibleTileMarkers,
        pickable: true,
        radiusUnits: "pixels",
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 42,
        getFillColor: [0, 0, 0, 0],
        onHover: (info) => {
          const id = (info.object as TileMarkerDatum | undefined)?.tile.id ?? null
          setHoveredTileId(id)
        },
        onClick: (info) => {
          const id = (info.object as TileMarkerDatum | undefined)?.tile.id
          if (id) setSelectedTileId(id)
        },
      })
    )

    layers.push(
      new ScatterplotLayer<TileMarkerDatum>({
        id: "tile-dots",
        data: visibleTileMarkers,
        pickable: false,
        radiusUnits: "pixels",
        stroked: true,
        getPosition: (d) => [d.lng, d.lat],
        getRadius: (d) =>
          d.tile.id === hoveredTileId || d.tile.id === selectedTileId ? 7 : 5,
        getFillColor: [24, 24, 27, 255],
        getLineColor: [255, 255, 255, 255],
        lineWidthUnits: "pixels",
        getLineWidth: (d) =>
          d.tile.id === hoveredTileId || d.tile.id === selectedTileId ? 2 : 2,
        updateTriggers: {
          getRadius: [hoveredTileId, selectedTileId],
          getLineWidth: [hoveredTileId, selectedTileId],
        },
      })
    )

    layers.push(
      new TextLayer<TileMarkerDatum>({
        id: "tile-labels",
        data: visibleTileMarkers,
        pickable: false,
        sizeUnits: "pixels",
        sizeScale: 1,
        getPosition: (d) => [d.lng, d.lat],
        getText: (d) => d.label,
        getSize: 11,
        getColor: [24, 24, 27, 255],
        getTextAnchor: "middle",
        getAlignmentBaseline: "bottom",
        getPixelOffset: [0, -14],
        background: true,
        getBackgroundColor: (d) =>
          d.tile.id === hoveredTileId || d.tile.id === selectedTileId
            ? [255, 255, 255, 255]
            : [255, 255, 255, Math.round(255 * 0.95)],
        backgroundPadding: [8, 4, 8, 4],
        backgroundBorderRadius: 6,
        getBorderColor: [0, 0, 0, Math.round(255 * 0.1)],
        getBorderWidth: 1,
        updateTriggers: {
          getBackgroundColor: [hoveredTileId, selectedTileId],
        },
      })
    )

    if (zoomedTileLabel) {
      layers.push(
        new TextLayer<ZoomedTileLabelDatum>({
          id: "zoomed-tile-label",
          data: [zoomedTileLabel],
          pickable: false,
          sizeUnits: "pixels",
          sizeScale: 1,
          getPosition: (d) => [d.lng, d.lat],
          getText: (d) => d.label,
          getSize: 11,
          getColor: [24, 24, 27, 255],
          getTextAnchor: "start",
          getAlignmentBaseline: "top",
          getPixelOffset: [8, 8],
          background: true,
          getBackgroundColor: [255, 255, 255, 255],
          backgroundPadding: [8, 4, 8, 4],
          backgroundBorderRadius: 6,
          getBorderColor: [0, 0, 0, Math.round(255 * 0.1)],
          getBorderWidth: 1,
        })
      )
    }

    return layers
  }, [
    activeOutlinePolygon,
    hoveredTileId,
    selectedTileId,
    setHoveredTileId,
    setSelectedTileId,
    visibleTileMarkers,
    zoomedTileLabel,
  ])

  return (
    <div ref={viewportRef} className="absolute inset-0">
      {webglSupported ? (
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: next }) => setViewState(next as EcotwinViewState)}
          controller={!isTileRoute}
          layers={deckLayers}
          style={{ width: "100%", height: "100%" }}
        >
          <Map
            ref={mapRef}
            mapboxAccessToken={token}
            mapLib={mapboxgl}
            interactive={false}
            viewState={{
              width: viewportSize.width,
              height: viewportSize.height,
              longitude: viewState.longitude,
              latitude: viewState.latitude,
              zoom: viewState.zoom,
              bearing: viewState.bearing ?? 0,
              pitch: viewState.pitch ?? 0,
              padding: { top: 0, bottom: 0, left: 0, right: 0 },
            }}
            mapStyle="mapbox://styles/sebastianait/cmj9rorhf004b01s9fj9m1ynh"
            attributionControl={false}
            style={{ width: "100%", height: "100%" }}
            onLoad={() => setMapLoaded(true)}
            onError={(e: ErrorEvent) => {
              const message =
                e.error?.message ?? "Map error (check console for details)"
              setMapError(message)
              console.error(e.error ?? e)
            }}
          >
            <canvas
              id="biomass-canvas"
              ref={biomassCanvasRef}
              className="pointer-events-none absolute -left-[9999px] -top-[9999px] opacity-0"
            />

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

            {biomassOverlay ? (
              <Source
                id="biomass-overlay"
                type="canvas"
                canvas="biomass-canvas"
                coordinates={biomassOverlay.coordinates}
              >
                <Layer
                  id="biomass-overlay-layer"
                  type="raster"
                  paint={{
                    "raster-opacity": 0.75,
                    "raster-resampling": "nearest",
                  }}
                />
              </Source>
            ) : null}
          </Map>

          {!isTileRoute ? <ZoomWidget /> : null}
        </DeckGL>
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
