import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox"
import { useControl } from "react-map-gl/mapbox"
import { useEffect } from "react"

export function MapboxDeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))

  useEffect(() => {
    overlay.setProps(props)
  }, [overlay, props])

  return null
}

