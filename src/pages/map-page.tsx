import { LeftPane } from "@/components/left-pane"
import { TileList } from "@/components/tile-list"
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
import { GlassPane } from "@/components/glass-pane"
import { ActionsPane } from "@/components/actions-pane"
import { TileDetails } from "@/components/tile-details"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"

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
    selectedTileId,
    setSelectedTileId,
    tiles,
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
          <GlassPane className="flex flex-col overflow-auto [scrollbar-gutter:stable]">
            <TileList selectedTileId={selectedTileId} />
          </GlassPane>
          {selectedTileId && <ActionsPane className="animate-in slide-in-from-left-4 fade-in duration-300 shrink-0" />}
        </LeftPane>

      {selectedTileId ? (
        <RightPane className="animate-in slide-in-from-right-4 fade-in duration-300">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between pb-2">
              <button
                type="button"
                onClick={() => setSelectedTileId(null)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="-rotate-90" />
                Close details
              </button>
              {selectedTile && (
                <button
                  type="button"
                  onClick={() => navigate(`/tile/${selectedTile.id}`)}
                  className="inline-flex cursor-pointer items-center rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-zinc-800 transition-colors"
                >
                  Configure tile
                </button>
              )}
            </div>

            <TileDetails 
              name={selectedTile?.name || "Untitled tile"} 
              status="Ready to run"
              createdDate={selectedTile?.created?.substring(0, 10) || "2025-12-12"}
              landcoverContent={
                <div>
                  {!selectedTile?.landcover ? (
                    <div className="text-xs text-zinc-500 italic">No landcover linked</div>
                  ) : selectedLandcover ? (
                    <div className="space-y-4">
                      <div className="aspect-square overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5">
                        {selectedLandcover.color_100 ||
                        selectedLandcover.color ||
                        selectedLandcover.texture_100 ||
                        selectedLandcover.texture ? (
                          <img
                            src={fileUrl(selectedLandcover, selectedLandcover.color_100 || selectedLandcover.color || selectedLandcover.texture_100 || selectedLandcover.texture) ?? ""}
                            alt="Landcover"
                            className="h-full w-full object-cover"
                            style={{ imageRendering: "pixelated" }}
                            onMouseEnter={() => {
                              const filename = selectedLandcover.color_100 || selectedLandcover.color || selectedLandcover.texture_100 || selectedLandcover.texture
                              const url = fileUrl(selectedLandcover, filename)
                              if (!url) return
                              setHoveredTileImageOverlay({ tileId: selectedTile.id, url, resampling: "nearest", opacity: 0.85 })
                            }}
                            onMouseLeave={clearOverlay}
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-xs text-zinc-400">No image</div>
                        )}
                      </div>
                      {coverageEntries && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Coverage</div>
                          <div className="space-y-1.5">
                            {coverageEntries.map((entry) => (
                              <div key={entry.key} className="flex items-center justify-between gap-2">
                                <span className="truncate text-[11px] text-zinc-600">{entry.key}</span>
                                <span className="shrink-0 text-[11px] font-semibold text-zinc-900">
                                  {entry.num !== null ? `${entry.num.toFixed(1)}%` : String(entry.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 animate-pulse">Loading landcover…</div>
                  )}
                </div>
              }
              oceanDataContent={
                <div>
                  {!selectedTile?.oceanData ? (
                    <div className="text-xs text-zinc-500 italic">No ocean data linked</div>
                  ) : selectedOceanData ? (
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["depth", selectedOceanData.depth] as const,
                          ["elevation", selectedOceanData.surface_elevation] as const,
                          ["temp", selectedOceanData.water_temperature] as const,
                          ["velocity", selectedOceanData.water_velocity] as const,
                        ] as const
                      ).map(([label, filename]) => {
                        if (!filename) return null
                        const url = fileUrl(selectedOceanData, filename)
                        const canPreview = isPreviewableImage(filename)
                        return (
                          <div key={label} className="rounded-md bg-white/50 p-2 ring-1 ring-black/5 hover:bg-white/80 transition-colors">
                            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</div>
                            <div className="mt-2 aspect-square rounded overflow-hidden bg-zinc-100">
                              {url && canPreview ? (
                                <img
                                  src={url}
                                  alt={label}
                                  className="h-full w-full object-cover"
                                  onMouseEnter={() => setHoveredTileImageOverlay({ tileId: selectedTile.id, url, resampling: "nearest", opacity: 0.85 })}
                                  onMouseLeave={clearOverlay}
                                />
                              ) : (
                                <div className="grid h-full place-items-center text-[9px] text-zinc-400">FILE</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 animate-pulse">Loading ocean data…</div>
                  )}
                </div>
              }
            />
          </div>
        </RightPane>
      ) : null}
    </>
  )
}
