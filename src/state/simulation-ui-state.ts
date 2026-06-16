import { atom } from "jotai"

// UI-only playback state shared by timeline + biomass grid.
// The step atom stores the sampled frame index, not the raw environment step.
export const simulationPlayingAtom = atom(false)
export const simulationStepAtom = atom(0)

export type BiomassVisualizationType = "screenGrid" | "h3Hexagon"
export const biomassVisualizationAtom = atom<BiomassVisualizationType>("screenGrid")
export const selectedSimulationSpeciesAtom = atom<string[] | null>(null)
export const visibleManagementPlanAreaIdsAtom = atom<string[] | null>(null)
export const demoActiveSimulationIdAtom = atom<string | null>(null)
