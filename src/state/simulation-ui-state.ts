import { atom } from "jotai"

// UI-only playback state shared by timeline + biomass grid.
export const simulationPlayingAtom = atom(false)
export const simulationStepAtom = atom(0)

