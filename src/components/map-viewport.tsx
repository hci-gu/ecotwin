import mapboxgl from "mapbox-gl"
import type { ErrorEvent } from "mapbox-gl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Map, { Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox"
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

export function MapViewport() {
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
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

  const tileMarkers = useMemo(() => {
    if (!tiles?.items?.length) return []
    return tiles.items.map((tile) => {
      const { lng, lat } = tileCenterLngLat(tile.x, tile.y, tile.zoom)
      return { tile, lng, lat }
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
        if (!map.isStyleLoaded() || !map.loaded()) return
        mapRef.current?.fitBounds(bounds, {
          padding: 80,
          duration: 800,
        })
        lastRouteZoomedTileIdRef.current = routeTileId
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Mapbox can throw "Style is not done loading" transiently during init/style reload.
        // Swallow and retry on the next idle tick.
        if (!message.toLowerCase().includes("style is not done loading")) {
          // eslint-disable-next-line no-console
          console.error(err)
        }
      }
    }

    const onIdle = () => attemptZoom()
    map.on("idle", onIdle)
    attemptZoom()

    return () => {
      canceled = true
      map.off("idle", onIdle)
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

	  const hoveredTileOutline = useMemo<
	    GeoJSON.FeatureCollection<
	      GeoJSON.Polygon,
	      { id: string; name: string | null }
	    > | null
	  >(() => {
	    if (!activeOutlineTileId) return null
	    const tile = getTileById(activeOutlineTileId)
	    if (!tile) return null

    const topLeft = tileCornerLngLat(tile.x, tile.y, tile.zoom)
    const bottomRight = tileCornerLngLat(tile.x + 1, tile.y + 1, tile.zoom)
    const topRight = { lng: bottomRight.lng, lat: topLeft.lat }
    const bottomLeft = { lng: topLeft.lng, lat: bottomRight.lat }

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: tile.id, name: tile.name ?? null },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [topLeft.lng, topLeft.lat],
                [topRight.lng, topRight.lat],
                [bottomRight.lng, bottomRight.lat],
                [bottomLeft.lng, bottomLeft.lat],
                [topLeft.lng, topLeft.lat],
              ],
            ],
          },
        },
	      ],
	    }
	  }, [activeOutlineTileId, getTileById])

  return (
    <div className="absolute inset-0">
      {webglSupported ? (
        <Map
          ref={mapRef}
          mapboxAccessToken={token}
          mapLib={mapboxgl}
          scrollZoom={!isTileRoute}
          boxZoom={!isTileRoute}
          dragRotate={!isTileRoute}
          dragPan={!isTileRoute}
          keyboard={!isTileRoute}
          doubleClickZoom={!isTileRoute}
          touchZoomRotate={!isTileRoute}
          touchPitch={!isTileRoute}
          initialViewState={{
            longitude: 19.0,
            latitude: 57.4,
            zoom: 5,
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

          {hoveredTileOutline ? (
	            <Source
	              id="hovered-tile-outline"
	              type="geojson"
	              data={hoveredTileOutline}
	            >
              <Layer
                id="hovered-tile-outline-layer"
                type="line"
                paint={{
                  "line-color": "#111827",
                  "line-width": 2,
                  "line-opacity": 0.65,
                }}
              />
            </Source>
          ) : null}

          {tileMarkers.map(({ tile, lng, lat }) => (
            (() => {
              const isActive =
                hoveredTileId === tile.id || selectedTileId === tile.id
              const isZoomedToTile = isTileRoute && routeTileId === tile.id

              if (isZoomedToTile) {
                const topLeft = tileCornerLngLat(tile.x, tile.y, tile.zoom)
                return (
                  <Marker
                    key={tile.id}
                    longitude={topLeft.lng}
                    latitude={topLeft.lat}
                    anchor="top-left"
                  >
                    <div className="pointer-events-none translate-x-2 translate-y-2 select-none">
                      <div className="max-w-44 truncate rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 shadow-sm ring-1 ring-black/10">
                        {tile.name || "Untitled tile"}
                      </div>
                    </div>
                  </Marker>
                )
              }

              return (
                <Marker
                  key={tile.id}
                  longitude={lng}
                  latitude={lat}
                  anchor="bottom"
                >
                  <div
                    className="pointer-events-auto flex cursor-pointer select-none flex-col items-center"
                    onMouseEnter={() => setHoveredTileId(tile.id)}
                    onMouseLeave={() => {
                      if (hoveredTileId === tile.id) setHoveredTileId(null)
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setSelectedTileId(tile.id)
                    }}
                  >
                    <div
                      className={[
                        "mb-1 max-w-40 truncate rounded-md px-2 py-1 text-[11px] font-medium shadow-sm ring-1 ring-black/10",
                        isActive
                          ? "bg-white text-zinc-900"
                          : "bg-white/95 text-zinc-900",
                      ].join(" ")}
                    >
                      {tile.name || "Untitled tile"}
                    </div>
                    <div
                      className={[
                        "rounded-full bg-zinc-900 ring-2 ring-white transition-[width,height,box-shadow] duration-150",
                        isActive ? "h-3.5 w-3.5 shadow-md" : "h-2.5 w-2.5",
                      ].join(" ")}
                    />
                  </div>
                </Marker>
              )
            })()
          ))}
        </Map>
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
