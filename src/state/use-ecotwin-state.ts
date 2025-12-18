import { useAtomValue, useSetAtom } from "jotai"

import {
  hoveredTileIdAtom,
  selectedTileIdAtom,
  loginAtom,
  logoutAtom,
  meAtom,
  meErrorAtom,
  meLoadingAtom,
  managementPlansAtom,
  managementPlansErrorAtom,
  managementPlansLoadingAtom,
  refreshEcotwinStateAtom,
  refreshManagementPlansAtom,
  refreshSimAgentsAtom,
  refreshSimulationsAtom,
  refreshTasksAtom,
  refreshTilesAtom,
  simAgentsAtom,
  simAgentsErrorAtom,
  simAgentsLoadingAtom,
  simulationsAtom,
  simulationsErrorAtom,
  simulationsLoadingAtom,
  tasksErrorAtom,
  tasksListAtom,
  tasksLoadingAtom,
  tilesErrorAtom,
  tilesListAtom,
  tilesLoadingAtom,
} from "@/state/ecotwin-atoms"

export function useEcotwinState() {
  const hoveredTileId = useAtomValue(hoveredTileIdAtom)
  const selectedTileId = useAtomValue(selectedTileIdAtom)
  const tiles = useAtomValue(tilesListAtom)
  const tilesLoading = useAtomValue(tilesLoadingAtom)
  const tilesError = useAtomValue(tilesErrorAtom)

  const me = useAtomValue(meAtom)
  const meLoading = useAtomValue(meLoadingAtom)
  const meError = useAtomValue(meErrorAtom)

  const managementPlans = useAtomValue(managementPlansAtom)
  const managementPlansLoading = useAtomValue(managementPlansLoadingAtom)
  const managementPlansError = useAtomValue(managementPlansErrorAtom)

  const tasks = useAtomValue(tasksListAtom)
  const tasksLoading = useAtomValue(tasksLoadingAtom)
  const tasksError = useAtomValue(tasksErrorAtom)

  const simulations = useAtomValue(simulationsAtom)
  const simulationsLoading = useAtomValue(simulationsLoadingAtom)
  const simulationsError = useAtomValue(simulationsErrorAtom)

  const simAgents = useAtomValue(simAgentsAtom)
  const simAgentsLoading = useAtomValue(simAgentsLoadingAtom)
  const simAgentsError = useAtomValue(simAgentsErrorAtom)

  const refreshAll = useSetAtom(refreshEcotwinStateAtom)
  const refreshTiles = useSetAtom(refreshTilesAtom)
  const refreshSimulations = useSetAtom(refreshSimulationsAtom)
  const refreshSimAgents = useSetAtom(refreshSimAgentsAtom)
  const refreshManagementPlans = useSetAtom(refreshManagementPlansAtom)
  const refreshTasks = useSetAtom(refreshTasksAtom)
  const login = useSetAtom(loginAtom)
  const logout = useSetAtom(logoutAtom)
  const setHoveredTileId = useSetAtom(hoveredTileIdAtom)
  const setSelectedTileId = useSetAtom(selectedTileIdAtom)

  return {
    hoveredTileId,
    setHoveredTileId,
    selectedTileId,
    setSelectedTileId,
    tiles,
    tilesLoading,
    tilesError,
    me,
    meLoading,
    meError,
    managementPlans,
    managementPlansLoading,
    managementPlansError,
    tasks,
    tasksLoading,
    tasksError,
    simulations,
    simulationsLoading,
    simulationsError,
    simAgents,
    simAgentsLoading,
    simAgentsError,
    refreshAll,
    refreshTiles,
    refreshSimulations,
    refreshSimAgents,
    refreshManagementPlans,
    refreshTasks,
    login,
    logout,
  }
}
