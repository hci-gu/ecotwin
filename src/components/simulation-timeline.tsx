import { useEffect, useMemo } from "react"
import { useAtom } from "jotai"

import { simulationPlayingAtom, simulationStepAtom } from "@/state/simulation-ui-state"

type SimulationTimelineProps = {
  episodeLength: number
}

export function SimulationTimeline({ episodeLength }: SimulationTimelineProps) {
  const maxStep = useMemo(() => Math.max(Math.floor(episodeLength) - 1, 0), [episodeLength])
  const [playing, setPlaying] = useAtom(simulationPlayingAtom)
  const [step, setStep] = useAtom(simulationStepAtom)

  useEffect(() => {
    setPlaying(false)
    setStep(0)
  }, [maxStep, setPlaying, setStep])

  useEffect(() => {
    if (!playing) return
    if (maxStep <= 0) return

    const timer = window.setInterval(() => {
      setStep((prev) => {
        const next = Math.min(prev + 1, maxStep)
        if (next >= maxStep) setPlaying(false)
        return next
      })
    }, 120)

    return () => window.clearInterval(timer)
  }, [maxStep, playing])

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={maxStep <= 0}
        onClick={() => setPlaying((p) => !p)}
        className="inline-flex cursor-pointer items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 shadow-sm ring-1 ring-black/10 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {playing ? "Pause" : "Play"}
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={maxStep}
          step={1}
          value={step}
          onChange={(e) => {
            setPlaying(false)
            setStep(Number(e.target.value))
          }}
          className="w-full"
        />
      </div>

      <div className="shrink-0 text-[11px] tabular-nums text-zinc-700">
        step {step} / {maxStep}
      </div>
    </div>
  )
}
