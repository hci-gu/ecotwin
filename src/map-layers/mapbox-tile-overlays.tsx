import { Layer, Source } from "react-map-gl/mapbox"
import { useMemo } from "react"

import type { ExpressionSpecification } from "mapbox-gl"
import type { Tile } from "@/state/ecotwin-types"

export const TILE_MARKERS_SOURCE_ID = "tile-markers"
export const TILE_HIT_AREA_LAYER_ID = "tile-hit-area"
export const TILE_DOTS_LAYER_ID = "tile-dots"
export const TILE_LABELS_LAYER_ID = "tile-labels"
export const TILE_OUTLINE_SOURCE_ID = "active-tile-outline"
export const TILE_OUTLINE_LAYER_ID = "active-tile-outline"
export const ZOOMED_TILE_LABEL_SOURCE_ID = "zoomed-tile-label"
export const ZOOMED_TILE_LABEL_LAYER_ID = "zoomed-tile-label"

export type TileMarkerDatum = {
  tile: Tile
  lng: number
  lat: number
  label: string
}

export type OutlineDatum = {
  tile: Tile
  polygon: [number, number][]
}

export type ZoomedTileLabelDatum = {
  tile: Tile
  lng: number
  lat: number
  label: string
}

export type MapboxTileOverlaysProps = {
  visibleTileMarkers: TileMarkerDatum[]
  hoveredTileId: string | null
  selectedTileId: string | null
  activeOutlinePolygon: OutlineDatum | null
  zoomedTileLabel: ZoomedTileLabelDatum | null
}

export function MapboxTileOverlays({
  visibleTileMarkers,
  hoveredTileId,
  selectedTileId,
  activeOutlinePolygon,
  zoomedTileLabel,
}: MapboxTileOverlaysProps) {
  const markersGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: visibleTileMarkers.map((m) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [m.lng, m.lat] },
        properties: {
          tileId: m.tile.id,
          label: m.label,
        },
      })),
    }),
    [visibleTileMarkers]
  )

  const outlineGeoJson = useMemo(() => {
    if (!activeOutlinePolygon) return null
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: activeOutlinePolygon.polygon,
          },
          properties: { tileId: activeOutlinePolygon.tile.id },
        },
      ],
    }
  }, [activeOutlinePolygon])

  const zoomedLabelGeoJson = useMemo(() => {
    if (!zoomedTileLabel) return null
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [zoomedTileLabel.lng, zoomedTileLabel.lat],
          },
          properties: { tileId: zoomedTileLabel.tile.id, label: zoomedTileLabel.label },
        },
      ],
    }
  }, [zoomedTileLabel])

  const isHoveredOrSelectedExpr: ExpressionSpecification = [
    "any",
    ["==", ["get", "tileId"], hoveredTileId],
    ["==", ["get", "tileId"], selectedTileId],
  ]

  const dotRadiusExpr: ExpressionSpecification = ["case", isHoveredOrSelectedExpr, 7, 5]
  const labelHaloExpr: ExpressionSpecification = [
    "case",
    isHoveredOrSelectedExpr,
    ["rgba", 255, 255, 255, 1],
    ["rgba", 255, 255, 255, 0.95],
  ]

  return (
    <>
      {outlineGeoJson ? (
        <Source id={TILE_OUTLINE_SOURCE_ID} type="geojson" data={outlineGeoJson}>
          <Layer
            id={TILE_OUTLINE_LAYER_ID}
            type="line"
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": ["rgba", 17, 24, 39, 0.65],
              "line-width": 2,
            }}
          />
        </Source>
      ) : null}

      <Source id={TILE_MARKERS_SOURCE_ID} type="geojson" data={markersGeoJson}>
        <Layer
          id={TILE_HIT_AREA_LAYER_ID}
          type="circle"
          paint={{
            "circle-radius": 42,
            "circle-color": ["rgba", 0, 0, 0, 0],
            "circle-opacity": 0.001,
            "circle-pitch-alignment": "viewport",
            "circle-pitch-scale": "viewport",
          }}
        />

        <Layer
          id={TILE_DOTS_LAYER_ID}
          type="circle"
          paint={{
            "circle-radius": dotRadiusExpr,
            "circle-color": ["rgba", 24, 24, 27, 1],
            "circle-opacity": 1,
            "circle-pitch-alignment": "viewport",
            "circle-pitch-scale": "viewport",
            "circle-stroke-color": ["rgba", 255, 255, 255, 1],
            "circle-stroke-width": 2,
            "circle-stroke-opacity": 1,
          }}
        />

        <Layer
          id={TILE_LABELS_LAYER_ID}
          type="symbol"
          layout={{
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-anchor": "bottom",
            "text-offset": [0, -0.7],
            "text-padding": 2,
          }}
          paint={{
            "text-color": ["rgba", 24, 24, 27, 1],
            "text-halo-color": labelHaloExpr,
            "text-halo-width": 1.4,
            "text-halo-blur": 0.6,
          }}
        />
      </Source>

      {zoomedLabelGeoJson ? (
        <Source id={ZOOMED_TILE_LABEL_SOURCE_ID} type="geojson" data={zoomedLabelGeoJson}>
          <Layer
            id={ZOOMED_TILE_LABEL_LAYER_ID}
            type="symbol"
            layout={{
              "text-field": ["get", "label"],
              "text-size": 11,
              "text-anchor": "top-left",
              "text-offset": [0.5, 0.5],
              "text-padding": 2,
            }}
            paint={{
              "text-color": ["rgba", 24, 24, 27, 1],
              "text-halo-color": ["rgba", 255, 255, 255, 1],
              "text-halo-width": 1.4,
              "text-halo-blur": 0.6,
            }}
          />
        </Source>
      ) : null}
    </>
  )
}
