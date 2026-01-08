import { useEcotwinState } from "@/state/use-ecotwin-state"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"

type TileListProps = {
  selectedTileId?: string | null
}

export function TileList({ selectedTileId }: TileListProps) {
  const navigate = useNavigate()
  const {
    hoveredTileId,
    setHoveredTileId,
    tiles,
    tilesLoading,
    tilesError,
  } = useEcotwinState()

  return (
    <>
      <div className="flex shrink-0 border-b border-black/5 bg-white/40 px-2 pt-2 backdrop-blur-sm">
        <div className="flex-1 cursor-pointer border-b-2 border-[#3f5a50] py-3 text-center text-sm font-bold text-zinc-900">
          Tiles
        </div>
        <div className="flex-1 cursor-pointer border-b-2 border-transparent py-3 text-center text-sm text-zinc-500 hover:text-zinc-700">
          (tab item)
        </div>
      </div>

      <div className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">
          Active tiles
        </h2>

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
      </div>
    </>
  )
}
