import { useMemo } from "react"

import type { SimulationResultBase64 } from "@/state/ecotwin-types"

type BiomassChartProps = {
  result: SimulationResultBase64
  height?: number
}

function decodeBase64ToArrayBuffer(b64: string) {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

type Series = {
  name: string
  color: string
  values: number[]
}

const defaultColors = [
  "#0f172a", // slate-900
  "#2563eb", // blue-600
  "#16a34a", // green-600
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#a855f7", // purple-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
]

export function BiomassChart({ result, height = 220 }: BiomassChartProps) {
  const computed = useMemo(() => {
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

    const totals = new Float64Array(n)
    const perSpecies =
      Array.isArray(result.species) && result.species.length === s
        ? Array.from({ length: s }, () => new Float64Array(n))
        : null

    let idx = 0
    for (let t = 0; t < n; t++) {
      let total = 0
      for (let cell = 0; cell < h * w; cell++) {
        for (let sp = 0; sp < s; sp++) {
          const v = data[idx++]
          total += v
          if (perSpecies) perSpecies[sp][t] += v
        }
      }
      totals[t] = total
    }

    const series: Series[] = [
      {
        name: "Total",
        color: "#0f172a",
        values: Array.from(totals, (v) => Number(v)),
      },
    ]

    if (perSpecies && s <= 6) {
      for (let sp = 0; sp < s; sp++) {
        series.push({
          name: result.species[sp] ?? `Species ${sp + 1}`,
          color: defaultColors[(sp + 1) % defaultColors.length],
          values: Array.from(perSpecies[sp], (v) => Number(v)),
        })
      }
    }

    let yMin = Infinity
    let yMax = -Infinity
    for (const line of series) {
      for (const v of line.values) {
        if (!Number.isFinite(v)) continue
        yMin = Math.min(yMin, v)
        yMax = Math.max(yMax, v)
      }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return null
    if (yMin === yMax) yMax = yMin + 1

    return { steps, series, yMin, yMax }
  }, [result.biomass_b64, result.shape, result.species, result.steps])

  if (!computed) {
    return (
      <div className="rounded-md bg-white/70 px-3 py-2 text-[11px] text-zinc-700 ring-1 ring-black/5">
        Biomass chart unavailable (invalid or incomplete simulation data).
      </div>
    )
  }

  const width = 640
  const padL = 44
  const padR = 14
  const padT = 12
  const padB = 26
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const xMin = computed.steps[0] ?? 0
  const xMax = computed.steps[computed.steps.length - 1] ?? 1
  const xSpan = xMax === xMin ? 1 : xMax - xMin

  const xFor = (x: number) => padL + ((x - xMin) / xSpan) * innerW
  const yFor = (y: number) =>
    padT + ((computed.yMax - y) / (computed.yMax - computed.yMin)) * innerH

  const yTicks = 4
  const xTicks = 4

  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => {
    const t = i / yTicks
    return computed.yMin + (computed.yMax - computed.yMin) * t
  })

  const xTickValues = Array.from({ length: xTicks + 1 }, (_, i) => {
    const t = i / xTicks
    return xMin + xSpan * t
  })

  const fmt = (v: number) => {
    if (!Number.isFinite(v)) return "—"
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`
    return v.toFixed(0)
  }

  return (
    <div className="rounded-md bg-white/70 p-3 ring-1 ring-black/5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold text-zinc-900">
          Biomass over time
        </div>
        <div className="text-[11px] text-zinc-600">
          sum over grid (H×W), per timestep
        </div>
      </div>

      <div className="mt-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label="Biomass over time chart"
        >
          {/* Axes */}
          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={padT + innerH}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={1}
          />
          <line
            x1={padL}
            y1={padT + innerH}
            x2={padL + innerW}
            y2={padT + innerH}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={1}
          />

          {/* Grid + ticks */}
          {yTickValues.map((v, i) => {
            const y = yFor(v)
            return (
              <g key={`y-${i}`}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + innerW}
                  y2={y}
                  stroke="rgba(0,0,0,0.08)"
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="rgba(0,0,0,0.55)"
                >
                  {fmt(v)}
                </text>
              </g>
            )
          })}

          {xTickValues.map((v, i) => {
            const x = xFor(v)
            return (
              <g key={`x-${i}`}>
                <line
                  x1={x}
                  y1={padT + innerH}
                  x2={x}
                  y2={padT + innerH + 4}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={padT + innerH + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(0,0,0,0.55)"
                >
                  {Math.round(v)}
                </text>
              </g>
            )
          })}

          {/* Lines */}
          {computed.series.map((line) => {
            const values = line.values
            let d = ""
            for (let i = 0; i < values.length; i++) {
              const yVal = values[i]
              if (!Number.isFinite(yVal)) continue
              const x = xFor(computed.steps[i] ?? i)
              const y = yFor(yVal)
              d += d ? ` L ${x} ${y}` : `M ${x} ${y}`
            }
            if (!d) return null
            return (
              <path
                key={line.name}
                d={d}
                fill="none"
                stroke={line.color}
                strokeWidth={line.name === "Total" ? 2 : 1.5}
                opacity={line.name === "Total" ? 0.95 : 0.85}
              />
            )
          })}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-700">
        {computed.series.map((s) => (
          <div key={s.name} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="truncate">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

