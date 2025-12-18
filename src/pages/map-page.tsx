import { LeftPane } from "@/components/left-pane"
import { RightPane } from "@/components/right-pane"
import { fileUrl } from "@/state/ecotwin-api"
import {
  fetchLandcoverAtom,
  fetchOceanDataAtom,
  hoveredTileImageOverlayAtom,
  landcoversByIdAtom,
  oceanDataByIdAtom,
} from "@/state/ecotwin-atoms"
import { useEcotwinState } from "@/state/use-ecotwin-state"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"

function isPreviewableImage(filename: string) {
  const lower = filename.toLowerCase()
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".avif") ||
    lower.endsWith(".bmp") ||
    lower.endsWith(".svg")
  )
}

export function MapPage() {
  const navigate = useNavigate()
  const {
    hoveredTileId,
    setHoveredTileId,
    selectedTileId,
    setSelectedTileId,
    tiles,
    tilesLoading,
    tilesError,
    refreshTiles,
  } = useEcotwinState()

  const selectedTile = tiles?.items.find((t) => t.id === selectedTileId)
  const landcoversById = useAtomValue(landcoversByIdAtom)
  const fetchLandcover = useSetAtom(fetchLandcoverAtom)
  const oceanDataById = useAtomValue(oceanDataByIdAtom)
  const fetchOceanData = useSetAtom(fetchOceanDataAtom)
  const setHoveredTileImageOverlay = useSetAtom(hoveredTileImageOverlayAtom)

  const selectedLandcover = useMemo(() => {
    if (!selectedTile?.landcover) return null
    return (
      (selectedTile.expand?.landcover as any) ??
      landcoversById[selectedTile.landcover]
    )
  }, [landcoversById, selectedTile])

  useEffect(() => {
    if (!selectedTile?.landcover) return
    if (selectedLandcover) return
    void fetchLandcover(selectedTile.landcover).catch(() => {})
  }, [fetchLandcover, selectedLandcover, selectedTile?.landcover])

  const selectedOceanData = useMemo(() => {
    if (!selectedTile?.oceanData) return null
    return (
      (selectedTile.expand?.oceanData as any) ??
      oceanDataById[selectedTile.oceanData]
    )
  }, [oceanDataById, selectedTile])

  useEffect(() => {
    if (!selectedTile?.oceanData) return
    if (selectedOceanData) return
    void fetchOceanData(selectedTile.oceanData).catch(() => {})
  }, [fetchOceanData, selectedOceanData, selectedTile?.oceanData])

  const coverageEntries = useMemo(() => {
    const coverage = selectedLandcover?.coverage
    if (!coverage || typeof coverage !== "object") return null
    const entries = Object.entries(coverage as Record<string, unknown>)
      .map(([key, value]) => ({
        key,
        value,
        num: typeof value === "number" ? value : null,
      }))
      .sort((a, b) => (b.num ?? -Infinity) - (a.num ?? -Infinity))
    return entries
  }, [selectedLandcover?.coverage])

  const clearOverlay = () => setHoveredTileImageOverlay(null)

  useEffect(() => {
    if (!selectedTileId) setHoveredTileImageOverlay(null)
  }, [selectedTileId, setHoveredTileImageOverlay])

  return (
    <>
      <LeftPane>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Tiles</h2>
          <button
            type="button"
            onClick={() => void refreshTiles()}
            className="cursor-pointer rounded-md bg-white/70 px-2 py-1 text-xs text-zinc-800 hover:bg-white"
          >
            Refresh
          </button>
        </div>

        {tiles ? (
          <div className="mt-1 text-xs text-zinc-700">
            Showing {tiles.items.length} of {tiles.totalItems}
          </div>
        ) : null}

        {tilesError ? (
          <div className="mt-3 rounded-md bg-white/80 p-2 text-xs text-zinc-900">
            {tilesError.message}
          </div>
        ) : null}

        {tilesLoading && !tiles ? (
          <div className="mt-3 text-sm text-zinc-800">Loading…</div>
        ) : null}

        <ul className="mt-3 space-y-2">
          {tiles?.items.map((tile) => {
            const image = fileUrl(tile, tile.satellite)
            const isActive =
              hoveredTileId === tile.id || selectedTileId === tile.id
            return (
              <li
                key={tile.id}
                onClick={() => {
                  setSelectedTileId(tile.id)
                }}
                onMouseEnter={() => setHoveredTileId(tile.id)}
                onMouseLeave={() => {
                  if (hoveredTileId === tile.id) setHoveredTileId(null)
                }}
                className={[
                  "flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors",
                  isActive
                    ? "bg-white ring-2 ring-zinc-900/20"
                    : "bg-white/70 hover:bg-white",
                ].join(" ")}
              >
                <div className="h-10 w-10 flex-none overflow-hidden rounded bg-zinc-200">
                  {image ? (
                    <img
                      src={image}
                      alt={
                        tile.name
                          ? `Tile ${tile.name}`
                          : `Tile ${tile.zoom}/${tile.x}/${tile.y}`
                      }
                      className="h-full w-full cursor-pointer object-cover"
                      loading="lazy"
                      onMouseEnter={() =>
                        setHoveredTileImageOverlay({
                          tileId: tile.id,
                          url: image,
                          resampling: "linear",
                          opacity: 0.75,
                        })
                      }
                      onMouseLeave={clearOverlay}
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-zinc-900">
                    {tile.name || "Untitled tile"}
                  </div>
                  <div className="truncate text-[11px] text-zinc-700">
                    {tile.zoom}/{tile.x}/{tile.y} · id: {tile.id}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </LeftPane>

      {selectedTileId ? (
        <RightPane>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">
                {selectedTile?.name || "Selected tile"}
              </div>
              <div className="mt-1 text-xs text-zinc-700">
                {selectedTile
                  ? `${selectedTile.zoom}/${selectedTile.x}/${selectedTile.y}`
                  : selectedTileId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedTileId(null)
              }}
              className="cursor-pointer rounded-md bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-50"
            >
              Close
            </button>
          </div>

	          {selectedTile ? (
	            <>
	              <div className="mt-4 space-y-2 text-xs text-zinc-800">
	                <div>
	                  <span className="text-zinc-600">id:</span> {selectedTile.id}
	                </div>
	                <div>
	                  <span className="text-zinc-600">x/y/zoom:</span>{" "}
	                  {selectedTile.x}/{selectedTile.y}/{selectedTile.zoom}
	                </div>
	              </div>

	              <div className="mt-6 border-t border-zinc-200 pt-4">
	                <button
	                  type="button"
	                  onClick={() => navigate(`/tile/${selectedTile.id}`)}
	                  className="inline-flex cursor-pointer items-center rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white shadow-sm"
	                >
	                  Select tile
	                </button>
	              </div>
	            </>
	          ) : (
	            <div className="mt-4 text-sm text-zinc-800">
	              Tile details not loaded.
            </div>
          )}

          <div className="mt-6 border-t border-zinc-200 pt-4">
            <div className="text-xs font-semibold text-zinc-900">
              Landcover
            </div>
            {!selectedTile?.landcover ? (
              <div className="mt-2 text-sm text-zinc-700">
                No landcover linked to this tile.
              </div>
	            ) : selectedLandcover ? (
	              <>
	                <div className="mt-2 aspect-square overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10">
	                  {selectedLandcover.color_100 ||
	                  selectedLandcover.color ||
	                  selectedLandcover.texture_100 ||
	                  selectedLandcover.texture ? (
                    <img
                      src={
                        fileUrl(
                          selectedLandcover,
                          selectedLandcover.color_100 ||
                            selectedLandcover.color ||
                            selectedLandcover.texture_100 ||
                            selectedLandcover.texture
                        ) ?? ""
                      }
                      alt="Landcover"
                      className="h-full w-full object-cover"
                      style={{ imageRendering: "pixelated" }}
                      loading="lazy"
                      onMouseEnter={() => {
                        const filename =
                          selectedLandcover.color_100 ||
                          selectedLandcover.color ||
                          selectedLandcover.texture_100 ||
                          selectedLandcover.texture
                        const url = fileUrl(selectedLandcover, filename)
                        if (!url) return
                        setHoveredTileImageOverlay({
                          tileId: selectedTile.id,
                          url,
                          resampling: "nearest",
                          opacity: 0.85,
                        })
                      }}
                      onMouseLeave={clearOverlay}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-zinc-600">
                      No landcover image
                    </div>
	                  )}
	                </div>

                {coverageEntries ? (
                  <div className="mt-4">
                    <div className="text-xs text-zinc-600">Coverage</div>
                    <div className="mt-2 space-y-1 text-xs text-zinc-800">
                      {coverageEntries.map((entry) => (
                        <div
                          key={entry.key}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <div className="min-w-0 truncate text-zinc-700">
                            {entry.key}
	                          </div>
	                          <div className="flex-none font-medium text-zinc-900">
	                            {entry.num !== null
	                              ? `${new Intl.NumberFormat(undefined, {
	                                  maximumFractionDigits: 1,
	                                }).format(entry.num)}%`
	                              : String(entry.value)}
	                          </div>
	                        </div>
	                      ))}
                    </div>
                  </div>
                ) : selectedLandcover.coverage ? (
                  <div className="mt-4 text-xs text-zinc-700">
                    Coverage: {JSON.stringify(selectedLandcover.coverage)}
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-zinc-700">
                    No coverage data.
                  </div>
                )}
              </>
            ) : (
              <div className="mt-2 text-sm text-zinc-700">
                Loading landcover…
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-4">
            <div className="text-xs font-semibold text-zinc-900">
              Ocean data
            </div>
            {!selectedTile?.oceanData ? (
              <div className="mt-2 text-sm text-zinc-700">
                No ocean data linked to this tile.
              </div>
            ) : selectedOceanData ? (
              <div className="mt-3 space-y-3">
                {(
                  [
                    ["depth", selectedOceanData.depth] as const,
                    ["surface_elevation", selectedOceanData.surface_elevation] as const,
                    ["water_temperature", selectedOceanData.water_temperature] as const,
                    ["water_velocity", selectedOceanData.water_velocity] as const,
                  ] as const
                ).map(([label, filename]) => {
                  if (!filename) return null
                  const url = fileUrl(selectedOceanData, filename)
                  const canPreview = isPreviewableImage(filename)
                  return (
                    <div
                      key={label}
                      className="rounded-md bg-white/70 p-2 ring-1 ring-black/5"
                    >
                      <div className="text-[11px] font-medium text-zinc-800">
                        {label}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="aspect-square w-16 overflow-hidden rounded bg-zinc-200">
                          {url && canPreview ? (
                            <img
                              src={url}
                              alt={label}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onMouseEnter={() =>
                                setHoveredTileImageOverlay({
                                  tileId: selectedTile.id,
                                  url,
                                  resampling: "nearest",
                                  opacity: 0.85,
                                })
                              }
                              onMouseLeave={clearOverlay}
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-[10px] text-zinc-600">
                              File
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs text-zinc-700">
                            {filename}
                          </div>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-xs font-medium text-zinc-900 underline underline-offset-2"
                            >
                              Open
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-2 text-sm text-zinc-700">
                Loading ocean data…
              </div>
            )}
          </div>
        </RightPane>
      ) : null}
    </>
  )
}
