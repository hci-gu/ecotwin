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
  tileByIdCacheAtom,
  tilesListAtom,
} from "@/state/ecotwin-atoms"

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

  const token = mapboxToken || undefined
  const mapRef = useRef<MapRef | null>(null)
  const tileRouteMatch = useMatch("/tile/:tileId/*")
  const routeTileId = tileRouteMatch?.params?.tileId
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
            <Marker
              key={tile.id}
              longitude={lng}
              latitude={lat}
              anchor="bottom"
            >
              {(() => {
                const isActive =
                  hoveredTileId === tile.id || selectedTileId === tile.id
                return (
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
                    isActive
                      ? "h-3.5 w-3.5 shadow-md"
                      : "h-2.5 w-2.5",
                  ].join(" ")}
                />
              </div>
                )
              })()}
            </Marker>
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
