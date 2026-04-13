import { atom } from "jotai"

import type { TileSelectionCandidate } from "@/lib/tile-selection"

export const tileCreationModeAtom = atom(false)
export const tileCreationZoomAtom = atom(6)
export const tileCreationHoverCandidateAtom = atom<TileSelectionCandidate | null>(null)
export const tileCreationSelectedCandidateAtom = atom<TileSelectionCandidate | null>(null)
