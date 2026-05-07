import { useEffect, useMemo } from "react"
import { useAtom } from "jotai"

import {
  formatSimulationDate,
  formatSimulationDateForStep,
} from "@/lib/simulation-dates"
import { simulationPlayingAtom, simulationStepAtom } from "@/state/simulation-ui-state"

type SimulationTimelineProps = {
  steps: number[]
  episodeLength: number
  startDate?: string | null
  endDate?: string | null
  tickDurationDays?: number | null
}

export function SimulationTimeline({
  steps,
  episodeLength,
  startDate,
  endDate,
  tickDurationDays,
}: SimulationTimelineProps) {
  const sampledSteps = useMemo(() => {
    const normalized = steps
      .map((step) => Number(step))
      .filter((step) => Number.isFinite(step) && step >= 0)
    return normalized.length ? normalized : [0]
  }, [steps])
  const maxFrame = useMemo(() => Math.max(sampledSteps.length - 1, 0), [sampledSteps.length])
  const maxEpisodeStep = useMemo(
    () => Math.max(Math.floor(Number(episodeLength)) - 1, 0),
    [episodeLength]
  )
  const [playing, setPlaying] = useAtom(simulationPlayingAtom)
  const [frame, setFrame] = useAtom(simulationStepAtom)
  const clampedFrame = Math.max(0, Math.min(frame, maxFrame))
  const currentStep = sampledSteps[clampedFrame] ?? 0
  const currentDateLabel = formatSimulationDateForStep(
    currentStep,
    startDate,
    tickDurationDays
  )
  const endDateLabel =
    formatSimulationDate(endDate) ??
    formatSimulationDateForStep(
      sampledSteps[maxFrame] ?? maxEpisodeStep,
      startDate,
      tickDurationDays
    )
  const dateProgressLabel =
    currentDateLabel && endDateLabel
      ? `${currentDateLabel} / ${endDateLabel}`
      : null

  useEffect(() => {
    setPlaying(false)
    setFrame(0)
  }, [sampledSteps, setFrame, setPlaying])

  useEffect(() => {
    if (!playing) return
    if (maxFrame <= 0) return

    const timer = window.setInterval(() => {
      setFrame((prev) => {
        const next = Math.min(prev + 1, maxFrame)
        if (next >= maxFrame) setPlaying(false)
        return next
      })
    }, 120)

    return () => window.clearInterval(timer)
  }, [maxFrame, playing, setFrame, setPlaying])

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={maxFrame <= 0}
        onClick={() => setPlaying((p) => !p)}
        className="inline-flex cursor-pointer items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {playing ? "Pause" : "Play"}
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={maxFrame}
          step={1}
          value={clampedFrame}
          onChange={(e) => {
            setPlaying(false)
            setFrame(Number(e.target.value))
          }}
          className="w-full accent-[#3f5a50]"
        />
      </div>

      <div className="shrink-0 text-[11px] tabular-nums text-zinc-700">
        sample {clampedFrame + 1} / {maxFrame + 1}
        {dateProgressLabel ? ` · ${dateProgressLabel}` : null}
      </div>
    </div>
  )
}
