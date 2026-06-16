import { useEffect, useMemo, useState } from "react"
import { useAtom } from "jotai"
import { PauseIcon, PlayIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  formatSimulationDate,
  formatSimulationDateForStep,
} from "@/lib/simulation-dates"
import { t } from "@/lib/translations"
import { cn } from "@/lib/utils"
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
  const [showCurrentLabel, setShowCurrentLabel] = useState(false)
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
  const currentLabel = currentDateLabel ?? String(Math.round(currentStep))
  const handleLeft = maxFrame > 0 ? (clampedFrame / maxFrame) * 100 : 0
  const currentLabelPositionClass =
    handleLeft < 8
      ? "translate-x-0"
      : handleLeft > 92
        ? "-translate-x-full"
        : "-translate-x-1/2"
  const tickCount = Math.min(4, Math.max(2, sampledSteps.length))
  const dateTicks = Array.from({ length: tickCount }, (_, index) => {
    const frameIndex =
      tickCount === 1 ? 0 : Math.round((index / (tickCount - 1)) * maxFrame)
    const step = sampledSteps[frameIndex] ?? 0
    return {
      key: `${index}-${frameIndex}`,
      left: tickCount === 1 ? 0 : (index / (tickCount - 1)) * 100,
      label:
        formatSimulationDateForStep(step, startDate, tickDurationDays) ??
        (index === tickCount - 1
          ? endDateLabel
          : String(Math.round(step))),
    }
  })

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
    <div className="flex items-start gap-3">
      <button
        type="button"
        disabled={maxFrame <= 0}
        aria-label={playing ? t("timeline.pausePlayback") : t("timeline.playPlayback")}
        title={playing ? t("timeline.pause") : t("timeline.play")}
        onClick={() => setPlaying((p) => !p)}
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-white text-zinc-900 shadow-sm ring-1 ring-black/10 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={16} strokeWidth={2} />
      </button>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="relative">
          {showCurrentLabel ? (
            <div
              className={cn(
                "pointer-events-none absolute -top-9 z-[80] whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-semibold tabular-nums text-white shadow-lg",
                currentLabelPositionClass
              )}
              style={{ left: `${handleLeft}%` }}
            >
              {currentLabel}
            </div>
          ) : null}
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
          onPointerDown={() => setShowCurrentLabel(true)}
          onPointerUp={() => setShowCurrentLabel(false)}
          onPointerCancel={() => setShowCurrentLabel(false)}
          onFocus={() => setShowCurrentLabel(true)}
          onBlur={() => setShowCurrentLabel(false)}
          className="w-full accent-[#3f5a50]"
        />
        </div>
        <div className="relative mt-1 h-5 text-[10px] leading-4 text-zinc-600">
          {dateTicks.map((tick, index) => (
            <div
              key={tick.key}
              className={
                index === 0
                  ? "absolute top-0 flex translate-x-0 flex-col items-start gap-0.5"
                  : index === dateTicks.length - 1
                    ? "absolute top-0 flex -translate-x-full flex-col items-end gap-0.5"
                    : "absolute top-0 flex -translate-x-1/2 flex-col items-center gap-0.5"
              }
              style={{ left: `${tick.left}%` }}
            >
              <span className="h-1.5 w-px bg-zinc-400/70" />
              <span className="whitespace-nowrap tabular-nums">{tick.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
