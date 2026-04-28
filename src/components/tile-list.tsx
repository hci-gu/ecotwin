import { useEcotwinState } from "@/state/use-ecotwin-state"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"

type TileListProps = {
  selectedTileId?: string | null
  createModeActive?: boolean
  onCreateLocationClick?: () => void
}

export function TileList({
  selectedTileId,
  createModeActive = false,
  onCreateLocationClick,
}: TileListProps) {
  const navigate = useNavigate()
  const {
    hoveredTileId,
    setHoveredTileId,
    tiles,
    tilesLoading,
    tilesError,
  } = useEcotwinState()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-black/5 bg-white/45 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-950">Tiles</h2>
          <span className="text-[11px] font-medium text-zinc-500">
            {tiles?.items.length ?? 0} active
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Active tiles
        </div>

        {tilesError ? (
          <div className="mb-4 rounded-md bg-red-50 p-2 text-xs text-red-600">
            {tilesError.message}
          </div>
        ) : null}

        {tilesLoading && !tiles ? (
          <div className="mb-4 text-sm text-zinc-500">Loading tiles…</div>
        ) : null}

        {tiles ? (
          <div className="space-y-3">
            {tiles.items.map((tile) => {
              const isActive =
                hoveredTileId === tile.id || selectedTileId === tile.id
              // Use created date if available, formatted to YYYY-MM-DD
              const createdDate = tile.created
                ? tile.created.substring(0, 10)
                : "Unknown date"

              return (
                <div
                  key={tile.id}
                  onClick={() => navigate(`/tile/${tile.id}`)}
                  onMouseEnter={() => setHoveredTileId(tile.id)}
                  onMouseLeave={() => {
                    if (hoveredTileId === tile.id) setHoveredTileId(null)
                  }}
                  className={cn(
                    "group cursor-pointer rounded-md border p-4 transition-all shadow-sm",
                    isActive
                      ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500 shadow-md"
                      : "border-zinc-200 bg-white/50 hover:border-zinc-400 hover:bg-white/80"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="font-medium text-zinc-900">
                      {tile.name || "Untitled tile"}
                    </div>
                    <div className="whitespace-nowrap text-xs text-zinc-600 group-hover:underline">
                      View details
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Created: {createdDate}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onCreateLocationClick}
          className={cn(
            "mt-5 flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors",
            createModeActive
              ? "bg-[#3f5a50] text-white hover:bg-[#344b42]"
              : "bg-zinc-900 text-white hover:bg-zinc-800"
          )}
        >
          {createModeActive ? "Selecting new location..." : "Create Location +"}
        </button>
      </div>
    </div>
  )
}
