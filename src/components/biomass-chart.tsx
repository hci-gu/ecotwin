import { useMemo, useState } from "react"
import { useAtomValue } from "jotai"

import { getSpeciesLabel } from "@/config/ecotwin-domain"
import { formatSimulationDateForStep } from "@/lib/simulation-dates"
import { speciesIndexOf } from "@/lib/species-matching"
import { getSpeciesColor } from "@/lib/species-colors"
import { t } from "@/lib/translations"
import type {
  SimulationBiomassSummary,
  SimulationResultBase64,
} from "@/state/ecotwin-types"
import { simulationStepAtom } from "@/state/simulation-ui-state"

type BiomassChartProps = {
  result: SimulationResultBase64
  height?: number
  selectedSpecies?: string[] | null
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
  lowValues?: number[]
  highValues?: number[]
}

type ComputedChart = {
  mode: "summary" | "tensor"
  steps: number[]
  series: Series[]
  yMin: number
  yMax: number
  subtitle: string
  valueFormat: "absolute" | "relative"
}

function isFiniteNumberArray(value: unknown, length: number) {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  )
}

function matrixIsValid(value: unknown, rows: number, columns: number) {
  return (
    Array.isArray(value) &&
    value.length === rows &&
    value.every((row) => isFiniteNumberArray(row, columns))
  )
}

function selectedSummaryIndices(
  summary: SimulationBiomassSummary,
  selectedSpecies?: string[] | null
) {
  if (selectedSpecies === null || selectedSpecies === undefined) {
    return summary.groups.map((_, index) => index)
  }
  if (!selectedSpecies.length) return []

  const selected = new Set(selectedSpecies)
  const groupSpecies =
    Array.isArray(summary.group_species) &&
    summary.group_species.length === summary.groups.length
      ? summary.group_species
      : null

  return summary.groups
    .map((group, index) => {
      if (selected.has(group)) return index
      const sources = groupSpecies?.[index] ?? []
      return sources.some((species) => selected.has(species)) ? index : -1
    })
    .filter((index) => index >= 0)
}

function computeSummaryChart(
  summary: SimulationBiomassSummary | undefined,
  selectedSpecies: string[] | null | undefined
): ComputedChart | null {
  if (!summary) return null
  const steps = Array.isArray(summary.steps)
    ? summary.steps.map((step) => Number(step))
    : []
  const groups = Array.isArray(summary.groups) ? summary.groups : []
  if (!steps.length || !groups.length) return null
  if (!steps.every((step) => Number.isFinite(step))) return null
  if (
    !matrixIsValid(summary.mean, groups.length, steps.length) ||
    !matrixIsValid(summary.ci_low, groups.length, steps.length) ||
    !matrixIsValid(summary.ci_high, groups.length, steps.length)
  ) {
    return null
  }

  const indices = selectedSummaryIndices(summary, selectedSpecies)
  const series = indices.map((groupIndex) => ({
    name: groups[groupIndex] ?? `Group ${groupIndex + 1}`,
    color: getSpeciesColor(groups[groupIndex], groupIndex).hex,
    values: summary.mean[groupIndex] ?? [],
    lowValues: summary.ci_low[groupIndex],
    highValues: summary.ci_high[groupIndex],
  }))

  if (!series.length) {
    return {
      mode: "summary",
      steps,
      series,
      yMin: 0,
      yMax: 1,
      subtitle: t("chart.noSelectedGroups"),
      valueFormat:
        summary.normalization === "relative_to_initial" ? "relative" : "absolute",
    }
  }

  let yMin = Infinity
  let yMax = -Infinity
  for (const line of series) {
    for (let index = 0; index < line.values.length; index += 1) {
      const values = [
        line.values[index],
        line.lowValues?.[index],
        line.highValues?.[index],
      ].filter((value): value is number => Number.isFinite(value))
      for (const value of values) {
        yMin = Math.min(yMin, value)
        yMax = Math.max(yMax, value)
      }
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return null
  if (yMin === yMax) yMax = yMin + 1

  const padding = (yMax - yMin) * 0.08
  yMin = Math.max(0, yMin - padding)
  yMax += padding

  const confidence =
    typeof summary.confidence_level === "number" &&
    Number.isFinite(summary.confidence_level)
      ? `${Math.round(summary.confidence_level * 100)}% CI`
      : t("chart.confidenceInterval")

  return {
    mode: "summary",
    steps,
    series,
    yMin,
    yMax,
    subtitle: t("chart.runsConfidence", { runs: summary.run_count, confidence }),
    valueFormat:
      summary.normalization === "relative_to_initial" ? "relative" : "absolute",
  }
}

function computeTensorChart(
  result: SimulationResultBase64,
  selectedSpecies: string[] | null | undefined
): ComputedChart | null {
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
  const speciesLabels =
    Array.isArray(result.species) && result.species.length === s
      ? result.species
      : Array.from({ length: s }, (_, i) => `Species ${i + 1}`)
  const selectedIndices =
    selectedSpecies === null || selectedSpecies === undefined
      ? Array.from({ length: s }, (_, i) => i)
      : selectedSpecies
          .map((name) => speciesIndexOf(speciesLabels, name))
          .filter((index) => index >= 0)
  const selectedIndexSet = new Set(selectedIndices)

  const totals = new Float64Array(n)
  const perSpecies =
    speciesLabels.length === s
      ? Array.from({ length: s }, () => new Float64Array(n))
      : null

  let idx = 0
  for (let t = 0; t < n; t++) {
    let total = 0
    for (let cell = 0; cell < h * w; cell++) {
      for (let sp = 0; sp < s; sp++) {
        const v = data[idx++]
        if (selectedIndexSet.has(sp)) total += v
        if (perSpecies) perSpecies[sp][t] += v
      }
    }
    totals[t] = total
  }

  const series: Series[] = [
    {
      name: t("chart.total"),
      color: "#0f172a",
      values: Array.from(totals, (v) => Number(v)),
    },
  ]

  if (perSpecies && selectedIndices.length <= 6) {
    for (const sp of selectedIndices) {
      series.push({
        name: getSpeciesLabel(speciesLabels[sp] ?? `Species ${sp + 1}`),
        color: getSpeciesColor(speciesLabels[sp], sp).hex,
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

  return {
    mode: "tensor",
    steps,
    series,
    yMin,
    yMax,
    subtitle: t("chart.sumOverGrid"),
    valueFormat: "absolute",
  }
}

function pathForValues(
  values: number[],
  steps: number[],
  xFor: (value: number) => number,
  yFor: (value: number) => number
) {
  let d = ""
  for (let i = 0; i < values.length; i++) {
    const yVal = values[i]
    if (!Number.isFinite(yVal)) continue
    const x = xFor(steps[i] ?? i)
    const y = yFor(yVal)
    d += d ? ` L ${x} ${y}` : `M ${x} ${y}`
  }
  return d || null
}

function bandPathForValues(
  lowValues: number[] | undefined,
  highValues: number[] | undefined,
  steps: number[],
  xFor: (value: number) => number,
  yFor: (value: number) => number
) {
  if (!lowValues || !highValues || lowValues.length !== highValues.length) {
    return null
  }

  const upper: string[] = []
  const lower: string[] = []
  for (let index = 0; index < highValues.length; index += 1) {
    const low = lowValues[index]
    const high = highValues[index]
    if (!Number.isFinite(low) || !Number.isFinite(high)) continue
    const x = xFor(steps[index] ?? index)
    upper.push(`${x} ${yFor(high)}`)
    lower.unshift(`${x} ${yFor(low)}`)
  }

  if (!upper.length || !lower.length) return null
  return `M ${upper.join(" L ")} L ${lower.join(" L ")} Z`
}

export function BiomassChart({
  result,
  height = 220,
  selectedSpecies,
}: BiomassChartProps) {
  const [showUncertainty, setShowUncertainty] = useState(true)
  const [hoverFrame, setHoverFrame] = useState<number | null>(null)
  const playbackFrame = useAtomValue(simulationStepAtom)
  const computed = useMemo(() => {
    return (
      computeSummaryChart(result.biomass_summary, selectedSpecies) ??
      computeTensorChart(result, selectedSpecies)
    )
  }, [result, selectedSpecies])

  if (!computed) {
    return (
      <div className="rounded-md bg-white/70 px-3 py-2 text-[11px] text-zinc-700 ring-1 ring-black/5">
        {t("chart.unavailable")}
      </div>
    )
  }

  const width = 640
  const padL = 34
  const padR = 12
  const padT = 12
  const padB = 32
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const xMin = computed.steps[0] ?? 0
  const xMax = computed.steps[computed.steps.length - 1] ?? 1
  const xSpan = xMax === xMin ? 1 : xMax - xMin

  const xFor = (x: number) => padL + ((x - xMin) / xSpan) * innerW
  const yFor = (y: number) =>
    padT + ((computed.yMax - y) / (computed.yMax - computed.yMin)) * innerH
  const frameForSvgX = (svgX: number) => {
    const step = xMin + ((svgX - padL) / innerW) * xSpan
    let bestIndex = 0
    let bestDistance = Infinity
    for (let index = 0; index < computed.steps.length; index += 1) {
      const distance = Math.abs((computed.steps[index] ?? index) - step)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    }
    return bestIndex
  }

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
  const xTickLabel = (value: number) =>
    formatSimulationDateForStep(
      value,
      result.start_date,
      result.tick_duration_days
    ) ?? String(Math.round(value))
  const subtitle =
    computed.mode === "tensor" &&
    formatSimulationDateForStep(xMin, result.start_date, result.tick_duration_days)
      ? t("chart.sumOverGridDate")
      : computed.subtitle

  const fmt = (v: number) => {
    if (!Number.isFinite(v)) return "-"
    if (computed.valueFormat === "relative") return v.toFixed(1)
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`
    return v.toFixed(0)
  }

  const showBands = computed.mode === "summary" && showUncertainty
  const currentFrame = Math.max(
    0,
    Math.min(Math.floor(playbackFrame), computed.steps.length - 1)
  )
  const activeFrame = hoverFrame ?? currentFrame
  const activeStep = computed.steps[activeFrame] ?? xMin
  const activeX = xFor(activeStep)
  const activeDateLabel =
    formatSimulationDateForStep(activeStep, result.start_date, result.tick_duration_days) ??
    String(Math.round(activeStep))
  const tooltipX = activeX > width - 160 ? activeX - 154 : activeX + 8
  const tooltipY = padT + 8
  const tooltipRows = computed.series.slice(0, 8).map((line) => ({
    name: line.name,
    color: line.color,
    value: line.values[activeFrame] ?? Number.NaN,
  }))

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-zinc-900">
            {computed.mode === "summary"
              ? t("chart.timeSeriesRelativeBiomass")
              : t("chart.biomassOverTime")}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-600">
            {subtitle}
          </div>
        </div>

        {computed.mode === "summary" ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-zinc-700">
            <input
              type="checkbox"
              checked={showUncertainty}
              onChange={(event) => setShowUncertainty(event.target.checked)}
              className="size-3 accent-blue-500"
            />
            {t("chart.showUncertainty")}
          </label>
        ) : null}
      </div>

      <div className="mt-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={t("chart.biomassOverTimeChart")}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const svgX = ((event.clientX - rect.left) / rect.width) * width
            setHoverFrame(frameForSvgX(Math.max(padL, Math.min(padL + innerW, svgX))))
          }}
          onMouseLeave={() => setHoverFrame(null)}
        >
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
                  textAnchor={
                    i === 0 ? "start" : i === xTickValues.length - 1 ? "end" : "middle"
                  }
                  fontSize="10"
                  fill="rgba(0,0,0,0.55)"
                >
                  {xTickLabel(v)}
                </text>
              </g>
            )
          })}

          {showBands
            ? computed.series.map((line) => {
                const d = bandPathForValues(
                  line.lowValues,
                  line.highValues,
                  computed.steps,
                  xFor,
                  yFor
                )
                if (!d) return null
                return (
                  <path
                    key={`${line.name}-ci`}
                    d={d}
                    fill={line.color}
                    opacity={0.16}
                  />
                )
              })
            : null}

          {computed.series.map((line) => {
            const d = pathForValues(line.values, computed.steps, xFor, yFor)
            if (!d) return null
            return (
              <path
                key={line.name}
                d={d}
                fill="none"
                stroke={line.color}
                strokeWidth={line.name === t("chart.total") ? 2 : 1.8}
                opacity={line.name === t("chart.total") ? 0.95 : 0.9}
              />
            )
          })}

          <line
            x1={xFor(computed.steps[currentFrame] ?? xMin)}
            y1={padT}
            x2={xFor(computed.steps[currentFrame] ?? xMin)}
            y2={padT + innerH}
            stroke="rgba(24,24,27,0.72)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
          />

          <rect
            x={padL}
            y={padT}
            width={innerW}
            height={innerH}
            fill="transparent"
          />

          {hoverFrame !== null ? (
            <g>
              <line
                x1={activeX}
                y1={padT}
                x2={activeX}
                y2={padT + innerH}
                stroke="rgba(63,90,80,0.72)"
                strokeWidth={1}
              />
              {tooltipRows.map((row) => {
                const value = row.value
                if (!Number.isFinite(value)) return null
                return (
                  <circle
                    key={`${row.name}-hover-point`}
                    cx={activeX}
                    cy={yFor(value)}
                    r={3}
                    fill="white"
                    stroke={row.color}
                    strokeWidth={1.5}
                  />
                )
              })}
              <rect
                x={tooltipX}
                y={tooltipY}
                width={146}
                height={24 + tooltipRows.length * 15}
                rx={4}
                fill="rgba(24,24,27,0.94)"
              />
              <text
                x={tooltipX + 8}
                y={tooltipY + 15}
                fontSize="10"
                fontWeight={700}
                fill="white"
              >
                {activeDateLabel}
              </text>
              {tooltipRows.map((row, index) => (
                <g key={`${row.name}-tooltip`} transform={`translate(${tooltipX + 8} ${tooltipY + 31 + index * 15})`}>
                  <circle cx={3} cy={-3} r={3} fill={row.color} />
                  <text x={10} y={0} fontSize="9" fill="rgba(255,255,255,0.86)">
                    {row.name}
                  </text>
                  <text x={130} y={0} textAnchor="end" fontSize="9" fill="white">
                    {fmt(row.value)}
                  </text>
                </g>
              ))}
            </g>
          ) : null}
        </svg>
      </div>

      {computed.series.length ? (
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
      ) : (
        <div className="mt-2 text-[11px] text-zinc-500">
          {t("chart.noSelectedSeries")}
        </div>
      )}
    </div>
  )
}
