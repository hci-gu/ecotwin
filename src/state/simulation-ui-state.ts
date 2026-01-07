import { atom } from "jotai"

// UI-only playback state shared by timeline + biomass grid.
export const simulationPlayingAtom = atom(false)
export const simulationStepAtom = atom(0)

export type BiomassVisualizationType = "screenGrid" | "h3Hexagon"
export const biomassVisualizationAtom = atom<BiomassVisualizationType>("screenGrid")
