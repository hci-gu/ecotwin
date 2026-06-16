import { LeftPane } from "@/components/left-pane"
import { TileList } from "@/components/tile-list"
import { RightPane } from "@/components/right-pane"
import { Input } from "@/components/ui/input"
import {
  hasActiveTileGeneration,
  landcoverStatusMessage,
  oceanDataStatusMessage,
  tilePrimaryStatus,
} from "@/lib/tile-population"
import { tileSelectionCandidateFromLngLat } from "@/lib/tile-selection"
import { createTile, fileUrl } from "@/state/ecotwin-api"
import {
  fetchLandcoverAtom,
  fetchOceanDataAtom,
  fetchTileByIdAtom,
  hoveredTileImageOverlayAtom,
  landcoversByIdAtom,
  oceanDataByIdAtom,
  tileByIdCacheAtom,
} from "@/state/ecotwin-atoms"
import type { Landcover, OceanData } from "@/state/ecotwin-types"
import {
  tileCreationHoverCandidateAtom,
  tileCreationModeAtom,
  tileCreationSelectedCandidateAtom,
  tileCreationZoomAtom,
} from "@/state/tile-creation-state"
import { useEcotwinState } from "@/state/use-ecotwin-state"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { GlassPane } from "@/components/glass-pane"
import { ActionsPane } from "@/components/actions-pane"
import { TileDetails } from "@/components/tile-details"
import { DetailRows } from "@/components/detail-rows"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import {
  formatArea,
  formatAssetStatus,
  formatMetersPerPixel,
  tileAreaKm2,
  type DetailRow,
} from "@/lib/tile-metrics"
import { t } from "@/lib/translations"

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
    managementPlans,
    simulations,
    refreshTiles,
  } = useEcotwinState()

  const tileByIdCache = useAtomValue(tileByIdCacheAtom)
  const landcoversById = useAtomValue(landcoversByIdAtom)
  const fetchTileById = useSetAtom(fetchTileByIdAtom)
  const fetchLandcover = useSetAtom(fetchLandcoverAtom)
  const oceanDataById = useAtomValue(oceanDataByIdAtom)
  const fetchOceanData = useSetAtom(fetchOceanDataAtom)
  const setHoveredTileImageOverlay = useSetAtom(hoveredTileImageOverlayAtom)
  const tileCreationMode = useAtomValue(tileCreationModeAtom)
  const setTileCreationMode = useSetAtom(tileCreationModeAtom)
  const tileCreationZoom = useAtomValue(tileCreationZoomAtom)
  const setTileCreationZoom = useSetAtom(tileCreationZoomAtom)
  const tileCreationHoverCandidate = useAtomValue(tileCreationHoverCandidateAtom)
  const tileCreationSelectedCandidate = useAtomValue(tileCreationSelectedCandidateAtom)
  const setTileCreationSelectedCandidate = useSetAtom(tileCreationSelectedCandidateAtom)
  const setTileCreationHoverCandidate = useSetAtom(tileCreationHoverCandidateAtom)
  const [isCreatingTile, setIsCreatingTile] = useState(false)
  const selectedTile = selectedTileId
    ? tileByIdCache[selectedTileId] ?? tiles?.items.find((t) => t.id === selectedTileId)
    : undefined
  const selectedTilePollId = selectedTile?.id ?? null
  const selectedTileHasActiveGeneration = hasActiveTileGeneration(selectedTile)

  const selectedLandcover = useMemo(() => {
    if (!selectedTile?.landcover) return null
    return selectedTile.expand?.landcover ?? (landcoversById[selectedTile.landcover] as Landcover | undefined) ?? null
  }, [landcoversById, selectedTile])

  useEffect(() => {
    if (!selectedTile?.landcover) return
    if (selectedLandcover) return
    void fetchLandcover(selectedTile.landcover).catch(() => {})
  }, [fetchLandcover, selectedLandcover, selectedTile?.landcover])

  const selectedOceanData = useMemo(() => {
    if (!selectedTile?.oceanData) return null
    return selectedTile.expand?.oceanData ?? (oceanDataById[selectedTile.oceanData] as OceanData | undefined) ?? null
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

  const selectedTilePlanIds = useMemo(() => {
    if (!selectedTile?.id) return new Set<string>()
    return new Set(
      (managementPlans ?? [])
        .filter(
          (plan) =>
            plan.tile === selectedTile.id || plan.expand?.tile?.id === selectedTile.id
        )
        .map((plan) => plan.id)
    )
  }, [managementPlans, selectedTile?.id])

  const selectedTileSimulationCount = useMemo(() => {
    if (!selectedTilePlanIds.size) return 0
    return (simulations ?? []).filter((simulation) => {
      const planId = simulation.expand?.plan?.id ?? simulation.plan
      return !!planId && selectedTilePlanIds.has(planId)
    }).length
  }, [selectedTilePlanIds, simulations])

  const selectedTileDetailRows = useMemo<DetailRow[]>(() => {
    if (!selectedTile) return []

    return [
      formatArea(tileAreaKm2(selectedTile))
        ? { label: t("common.area"), value: formatArea(tileAreaKm2(selectedTile))! }
        : null,
      formatMetersPerPixel(selectedTile.metersPerPixel)
        ? {
            label: t("common.resolution"),
            value: formatMetersPerPixel(selectedTile.metersPerPixel)!,
          }
        : null,
      {
        label: t("common.landcover"),
        value:
          formatAssetStatus(selectedTile.landcoverStatus, Boolean(selectedTile.landcover)) ??
          t("common.notLinked"),
      },
      {
        label: t("common.oceanData"),
        value:
          formatAssetStatus(selectedTile.oceanDataStatus, Boolean(selectedTile.oceanData)) ??
          t("common.notLinked"),
      },
      { label: t("common.managementPlans"), value: String(selectedTilePlanIds.size) },
      { label: t("common.simulations"), value: String(selectedTileSimulationCount) },
    ].filter((row): row is DetailRow => Boolean(row))
  }, [selectedTile, selectedTilePlanIds.size, selectedTileSimulationCount])

  const clearOverlay = () => setHoveredTileImageOverlay(null)

  useEffect(() => {
    if (!selectedTileId) setHoveredTileImageOverlay(null)
  }, [selectedTileId, setHoveredTileImageOverlay])

  useEffect(() => {
    if (!selectedTilePollId || !selectedTileHasActiveGeneration) return

    void fetchTileById({ id: selectedTilePollId }).catch(() => {})
    const interval = window.setInterval(() => {
      void fetchTileById({ id: selectedTilePollId }).catch(() => {})
      void refreshTiles().catch(() => {})
    }, 3000)

    return () => window.clearInterval(interval)
  }, [fetchTileById, refreshTiles, selectedTileHasActiveGeneration, selectedTilePollId])

  const existingTileForCandidate = useMemo(() => {
    if (!tileCreationSelectedCandidate || !tiles?.items?.length) return null
    return (
      tiles.items.find(
        (tile) =>
          tile.x === tileCreationSelectedCandidate.x &&
          tile.y === tileCreationSelectedCandidate.y &&
          tile.zoom === tileCreationSelectedCandidate.zoom
      ) ?? null
    )
  }, [tileCreationSelectedCandidate, tiles?.items])

  const preferredTileCreationZoom = useMemo(() => {
    const zoomCounts = new Map<number, number>()
    for (const tile of tiles?.items ?? []) {
      zoomCounts.set(tile.zoom, (zoomCounts.get(tile.zoom) ?? 0) + 1)
    }
    let bestZoom = 6
    let bestCount = -1
    for (const [zoom, count] of zoomCounts.entries()) {
      if (count > bestCount) {
        bestZoom = zoom
        bestCount = count
      }
    }
    return bestZoom
  }, [tiles?.items])

  useEffect(() => {
    if (tileCreationMode) return
    setTileCreationZoom(preferredTileCreationZoom)
  }, [preferredTileCreationZoom, setTileCreationZoom, tileCreationMode])

  useEffect(() => {
    if (!tileCreationHoverCandidate && !tileCreationSelectedCandidate) return

    if (tileCreationHoverCandidate && tileCreationHoverCandidate.zoom !== tileCreationZoom) {
      setTileCreationHoverCandidate(
        tileSelectionCandidateFromLngLat(
          tileCreationHoverCandidate.center.lng,
          tileCreationHoverCandidate.center.lat,
          tileCreationZoom
        )
      )
    }

    if (tileCreationSelectedCandidate && tileCreationSelectedCandidate.zoom !== tileCreationZoom) {
      setTileCreationSelectedCandidate(
        tileSelectionCandidateFromLngLat(
          tileCreationSelectedCandidate.center.lng,
          tileCreationSelectedCandidate.center.lat,
          tileCreationZoom
        )
      )
    }
  }, [
    setTileCreationHoverCandidate,
    setTileCreationSelectedCandidate,
    tileCreationHoverCandidate,
    tileCreationSelectedCandidate,
    tileCreationZoom,
  ])
  const tileStatus = tilePrimaryStatus(selectedTile ?? null)

  function handleToggleCreateLocationMode() {
    const next = !tileCreationMode
    setTileCreationMode(next)
    setTileCreationHoverCandidate(null)
    setTileCreationSelectedCandidate(null)
    if (next) {
      setSelectedTileId(null)
      return
    }
  }

  async function handleCreateLocation() {
    if (!tileCreationSelectedCandidate) return
    if (existingTileForCandidate) {
      navigate(`/tile/${existingTileForCandidate.id}`)
      return
    }

    setIsCreatingTile(true)
    try {
      const tile = await createTile({
        name: `Location ${tileCreationSelectedCandidate.zoom}/${tileCreationSelectedCandidate.x}/${tileCreationSelectedCandidate.y}`,
        visible: true,
        x: tileCreationSelectedCandidate.x,
        y: tileCreationSelectedCandidate.y,
        zoom: tileCreationSelectedCandidate.zoom,
        bbox: tileCreationSelectedCandidate.bbox,
      })
      await refreshTiles()
      setTileCreationMode(false)
      setTileCreationHoverCandidate(null)
      setTileCreationSelectedCandidate(null)
      navigate(`/tile/${tile.id}`)
    } finally {
      setIsCreatingTile(false)
    }
  }

  function handleTileCreationZoomChange(value: string) {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed)) return
    setTileCreationZoom(Math.max(0, Math.min(22, parsed)))
  }

  return (
    <>
        <LeftPane>
          <GlassPane className="flex flex-col overflow-hidden">
            <TileList
              selectedTileId={selectedTileId}
              createModeActive={tileCreationMode}
              onCreateLocationClick={handleToggleCreateLocationMode}
            />
          </GlassPane>
          {selectedTile ? (
            <ActionsPane
              className="animate-in slide-in-from-left-4 fade-in duration-300 shrink-0"
              onEdit={() => navigate(`/tile/${selectedTile.id}`)}
            />
          ) : null}
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
                {t("tiles.closeDetails")}
              </button>
              {selectedTile && (
                <button
                  type="button"
                  onClick={() => navigate(`/tile/${selectedTile.id}`)}
                  className="inline-flex cursor-pointer items-center rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-zinc-800 transition-colors"
                >
                  {t("tiles.configureTile")}
                </button>
              )}
            </div>

            <TileDetails 
              name={selectedTile?.name || t("common.untitledTile")} 
              status={tileStatus.label}
              statusTone={tileStatus.tone}
              createdDate={selectedTile?.created?.substring(0, 10) || t("common.unknownDate")}
              simulationInfoContent={<DetailRows rows={selectedTileDetailRows} />}
              landcoverContent={
                <div>
                  {!selectedTile?.landcover ? (
                    <div className="text-xs text-zinc-500 italic">{landcoverStatusMessage(selectedTile ?? null)}</div>
                  ) : selectedLandcover ? (
                    <div className="space-y-4">
                      <div className="aspect-square overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5">
                        {selectedLandcover.color_100 ||
                        selectedLandcover.color ||
                        selectedLandcover.texture_100 ||
                        selectedLandcover.texture ? (
                          <img
                            src={fileUrl(selectedLandcover, selectedLandcover.color_100 || selectedLandcover.color || selectedLandcover.texture_100 || selectedLandcover.texture) ?? ""}
                            alt={t("common.landcover")}
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
                          <div className="grid h-full place-items-center text-xs text-zinc-400">{t("common.noImage")}</div>
                        )}
                      </div>
                      {coverageEntries && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t("common.coverage")}</div>
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
                    <div className="text-xs text-zinc-500 animate-pulse">{t("common.loadingLandcover")}</div>
                  )}
                </div>
              }
              oceanDataContent={
                <div>
                  {!selectedTile?.oceanData ? (
                    <div className="text-xs text-zinc-500 italic">{oceanDataStatusMessage(selectedTile ?? null)}</div>
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
                                <div className="grid h-full place-items-center text-[9px] text-zinc-400">{t("common.file")}</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 animate-pulse">{t("common.loadingOceanData")}</div>
                  )}
                </div>
              }
            />
          </div>
        </RightPane>
      ) : tileCreationMode ? (
        <RightPane className="animate-in slide-in-from-right-4 fade-in duration-300">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between pb-2">
              <button
                type="button"
                onClick={() => {
                  setTileCreationMode(false)
                  setTileCreationHoverCandidate(null)
                  setTileCreationSelectedCandidate(null)
                }}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="-rotate-90" />
                {t("tiles.closePreview")}
              </button>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white/70 p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {t("tiles.newLocation")}
              </div>
              <div className="mt-2 text-lg font-semibold text-zinc-950">
                {tileCreationSelectedCandidate
                  ? existingTileForCandidate
                  ? existingTileForCandidate.name || t("tiles.existingLocation")
                  : `Location ${tileCreationSelectedCandidate.zoom}/${tileCreationSelectedCandidate.x}/${tileCreationSelectedCandidate.y}`
                  : t("tiles.selectLocationSize")}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {t("tiles.tileCreationHelp")}
              </div>

              <div className="mt-5 space-y-3 text-sm text-zinc-700">
                <div className="flex items-center justify-between gap-4">
                  <span>{t("common.zoomLevel")}</span>
                  <Input
                    type="number"
                    min={0}
                    max={22}
                    step={1}
                    value={tileCreationZoom}
                    onChange={(event) => handleTileCreationZoomChange(event.target.value)}
                    className="w-20 text-right font-medium text-zinc-950"
                  />
                </div>
                {tileCreationSelectedCandidate ? (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <span>{t("common.xY")}</span>
                      <span className="font-medium text-zinc-950">
                        {tileCreationSelectedCandidate.x} / {tileCreationSelectedCandidate.y}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span>{t("common.center")}</span>
                      <span className="text-right font-medium text-zinc-950">
                        {tileCreationSelectedCandidate.center.lat.toFixed(4)}°,{" "}
                        {tileCreationSelectedCandidate.center.lng.toFixed(4)}°
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span>{t("common.bbox")}</span>
                      <span className="max-w-[10rem] break-all text-right font-mono text-[11px] text-zinc-600">
                        {tileCreationSelectedCandidate.bbox}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-xs text-zinc-500">
                    {t("tiles.noLocationSelected")}
                  </div>
                )}
              </div>

              {tileCreationSelectedCandidate && existingTileForCandidate ? (
                <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t("tiles.thisLocationExists")}
                </div>
              ) : null}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={handleCreateLocation}
                  disabled={isCreatingTile || !tileCreationSelectedCandidate}
                  className="flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
                >
                  {!tileCreationSelectedCandidate
                    ? t("tiles.selectLocationOnMap")
                    : existingTileForCandidate
                    ? t("tiles.openExistingLocation")
                    : isCreatingTile
                      ? t("tiles.creating")
                      : t("tiles.createLocation")}
                </button>
                <button
                  type="button"
                  onClick={() => setTileCreationSelectedCandidate(null)}
                  disabled={!tileCreationSelectedCandidate}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  {t("tiles.pickAnother")}
                </button>
              </div>
            </div>
          </div>
        </RightPane>
      ) : null}
    </>
  )
}
