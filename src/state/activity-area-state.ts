import { atom } from "jotai"

import type { ActivityAreaPoint } from "@/lib/activity-area"

export const activityAreaDrawingActiveAtom = atom(false)
export const activityAreaPointsAtom = atom<ActivityAreaPoint[]>([])
export const activityAreaHoverPointAtom = atom<ActivityAreaPoint | null>(null)
