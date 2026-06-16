import type { DetailRow } from "@/lib/tile-metrics"
import { t } from "@/lib/translations"

type DetailRowsProps = {
  rows: DetailRow[]
  emptyLabel?: string
}

export function DetailRows({ rows, emptyLabel = t("detailRows.empty") }: DetailRowsProps) {
  if (!rows.length) {
    return <div className="text-xs text-zinc-500">{emptyLabel}</div>
  }

  return (
    <div className="space-y-2 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <span className="text-zinc-500">{row.label}</span>
          <span className="text-right font-medium text-zinc-900">{row.value}</span>
        </div>
      ))}
    </div>
  )
}
