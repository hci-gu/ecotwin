import { atom } from "jotai"

import type { ListResult } from "@/state/ecotwin-api"
import {
  fileUrl,
  fetchSimAgents,
  fetchSimById,
  fetchMe,
  fetchSimulationResult,
  getHeightmap,
  getLandcover,
  getManagementPlan,
  getOceanData,
  getSimulation,
  getTile,
  getTileByXYZ,
  loginUser,
  listAllTimesteps,
  listManagementPlans,
  listSimulations,
  listTasks,
  listTiles,
  logoutUser,
  runSimulationByRecordId,
} from "@/state/ecotwin-api"
import type {
  Heightmap,
  Landcover,
  ManagementPlan,
  OceanData,
  SimAgentsResponse,
  SimByIdResponse,
  Simulation,
  SimulationResultBase64,
  Task,
  Tile,
  Timestep,
  User,
} from "@/state/ecotwin-types"

function toError(err: unknown) {
  return err instanceof Error ? err : new Error(String(err))
}

export const hoveredTileIdAtom = atom<string | null>(null)
export const selectedTileIdAtom = atom<string | null>(null)

export type TileImageOverlay = {
  tileId: string
  url: string
  opacity?: number
  resampling?: "linear" | "nearest"
}

export const hoveredTileImageOverlayAtom = atom<TileImageOverlay | null>(null)

export const tilesListAtom = atom<ListResult<Tile> | null>(null)
export const tilesLoadingAtom = atom(false)
export const tilesErrorAtom = atom<Error | null>(null)
export const refreshTilesAtom = atom(
  null,
  async (
    get,
    set,
    args?: {
      page?: number
      perPage?: number
      sort?: string
      filter?: string
      expand?: string
      fields?: string
    }
  ) => {
    if (get(tilesLoadingAtom)) return
    set(tilesLoadingAtom, true)
    set(tilesErrorAtom, null)
    try {
      const res = await listTiles(
        args?.page ?? 1,
        args?.perPage ?? 30,
        {
          sort: args?.sort ?? "-created",
          filter: args?.filter,
          expand:
            args?.expand ??
            "heightmap,landcover,oceanData,simulations,simulations.plan,simulations.plan.tasks",
          fields: args?.fields,
        }
      )
      set(tilesListAtom, res)
    } catch (err) {
      set(tilesErrorAtom, toError(err))
    } finally {
      set(tilesLoadingAtom, false)
    }
  }
)

export const tileByXYZCacheAtom = atom<Record<string, Tile>>({})
export const tileByXYZLoadingAtom = atom(false)
export const tileByXYZErrorAtom = atom<Error | null>(null)
export const fetchTileByXYZAtom = atom(
  null,
  async (
    get,
    set,
    args: { x: number; y: number; zoom: number; expand?: string; fields?: string }
  ) => {
    const key = `${args.zoom}/${args.x}/${args.y}`
    if (get(tileByXYZLoadingAtom)) return get(tileByXYZCacheAtom)[key]
    set(tileByXYZLoadingAtom, true)
    set(tileByXYZErrorAtom, null)
	    try {
	      const tile = await getTileByXYZ(args.x, args.y, args.zoom, {
	        expand:
	          args.expand ??
	          "heightmap,landcover,oceanData,simulations,simulations.plan,simulations.plan.tasks",
	        fields: args.fields,
	      })
      set(tileByXYZCacheAtom, (prev) => ({ ...prev, [key]: tile }))
      return tile
    } catch (err) {
      set(tileByXYZErrorAtom, toError(err))
      throw err
    } finally {
      set(tileByXYZLoadingAtom, false)
    }
  }
)

export const tileByIdCacheAtom = atom<Record<string, Tile>>({})
export const tileByIdLoadingAtom = atom(false)
export const tileByIdErrorAtom = atom<Error | null>(null)
export const fetchTileByIdAtom = atom(null, async (get, set, args: { id: string; expand?: string; fields?: string }) => {
  if (get(tileByIdLoadingAtom)) return get(tileByIdCacheAtom)[args.id]
  set(tileByIdLoadingAtom, true)
  set(tileByIdErrorAtom, null)
  try {
    const tile = await getTile(args.id, {
      expand:
        args.expand ??
        "heightmap,landcover,oceanData,simulations,simulations.plan,simulations.plan.tasks",
      fields: args.fields,
    })
    set(tileByIdCacheAtom, (prev) => ({ ...prev, [args.id]: tile }))
    return tile
  } catch (err) {
    set(tileByIdErrorAtom, toError(err))
    return undefined
  } finally {
    set(tileByIdLoadingAtom, false)
  }
})

export const heightmapsByIdAtom = atom<Record<string, Heightmap>>({})
export const landcoversByIdAtom = atom<Record<string, Landcover>>({})
export const oceanDataByIdAtom = atom<Record<string, OceanData>>({})

export const assetsLoadingAtom = atom(false)
export const assetsErrorAtom = atom<Error | null>(null)
export const fetchHeightmapAtom = atom(null, async (get, set, id: string) => {
  if (get(assetsLoadingAtom)) return get(heightmapsByIdAtom)[id]
  set(assetsLoadingAtom, true)
  set(assetsErrorAtom, null)
  try {
    const res = await getHeightmap(id)
    set(heightmapsByIdAtom, (prev) => ({ ...prev, [id]: res }))
    return res
  } catch (err) {
    set(assetsErrorAtom, toError(err))
    return undefined
  } finally {
    set(assetsLoadingAtom, false)
  }
})

export const fetchLandcoverAtom = atom(null, async (get, set, id: string) => {
  if (get(assetsLoadingAtom)) return get(landcoversByIdAtom)[id]
  set(assetsLoadingAtom, true)
  set(assetsErrorAtom, null)
  try {
    const res = await getLandcover(id)
    set(landcoversByIdAtom, (prev) => ({ ...prev, [id]: res }))
    return res
  } catch (err) {
    set(assetsErrorAtom, toError(err))
    return undefined
  } finally {
    set(assetsLoadingAtom, false)
  }
})

export const fetchOceanDataAtom = atom(null, async (get, set, id: string) => {
  if (get(assetsLoadingAtom)) return get(oceanDataByIdAtom)[id]
  set(assetsLoadingAtom, true)
  set(assetsErrorAtom, null)
  try {
    const res = await getOceanData(id)
    set(oceanDataByIdAtom, (prev) => ({ ...prev, [id]: res }))
    return res
  } catch (err) {
    set(assetsErrorAtom, toError(err))
    return undefined
  } finally {
    set(assetsLoadingAtom, false)
  }
})

export const simulationsAtom = atom<Simulation[] | null>(null)
export const simulationsLoadingAtom = atom(false)
export const simulationsErrorAtom = atom<Error | null>(null)
export const refreshSimulationsAtom = atom(null, async (get, set) => {
  if (get(simulationsLoadingAtom)) return
  set(simulationsLoadingAtom, true)
  set(simulationsErrorAtom, null)
  try {
    const res = await listSimulations({ sort: "-created", expand: "plan,plan.tasks" })
    set(simulationsAtom, res)
  } catch (err) {
    set(simulationsErrorAtom, toError(err))
  } finally {
    set(simulationsLoadingAtom, false)
  }
})

export const simulationByIdCacheAtom = atom<Record<string, Simulation>>({})
export const simulationByIdLoadingAtom = atom(false)
export const simulationByIdErrorAtom = atom<Error | null>(null)
export const fetchSimulationByIdAtom = atom(null, async (get, set, args: { id: string; expand?: string; fields?: string }) => {
  if (get(simulationByIdLoadingAtom)) return get(simulationByIdCacheAtom)[args.id]
  set(simulationByIdLoadingAtom, true)
  set(simulationByIdErrorAtom, null)
  try {
    const sim = await getSimulation(args.id, {
      expand: args.expand ?? "plan,plan.tasks",
      fields: args.fields,
    })
    set(simulationByIdCacheAtom, (prev) => ({ ...prev, [args.id]: sim }))
    set(simulationsAtom, (prev) => {
      if (!prev?.length) return prev
      const next = prev.map((s) => (s.id === args.id ? sim : s))
      return next
    })
    return sim
  } catch (err) {
    set(simulationByIdErrorAtom, toError(err))
    return undefined
  } finally {
    set(simulationByIdLoadingAtom, false)
  }
})

export const managementPlansAtom = atom<ManagementPlan[] | null>(null)
export const managementPlansLoadingAtom = atom(false)
export const managementPlansErrorAtom = atom<Error | null>(null)
export const refreshManagementPlansAtom = atom(null, async (get, set) => {
  if (get(managementPlansLoadingAtom)) return
  set(managementPlansLoadingAtom, true)
  set(managementPlansErrorAtom, null)
  try {
    const res = await listManagementPlans({ sort: "-created", expand: "tasks" })
    set(managementPlansAtom, res)
  } catch (err) {
    set(managementPlansErrorAtom, toError(err))
  } finally {
    set(managementPlansLoadingAtom, false)
  }
})

export const managementPlanByIdCacheAtom = atom<Record<string, ManagementPlan>>({})
export const managementPlanByIdLoadingAtom = atom(false)
export const managementPlanByIdErrorAtom = atom<Error | null>(null)
export const fetchManagementPlanByIdAtom = atom(
  null,
  async (
    get,
    set,
    args: { id: string; expand?: string; fields?: string }
  ) => {
    if (get(managementPlanByIdLoadingAtom))
      return get(managementPlanByIdCacheAtom)[args.id]

    set(managementPlanByIdLoadingAtom, true)
    set(managementPlanByIdErrorAtom, null)
    try {
      const plan = await getManagementPlan(args.id, {
        expand: args.expand ?? "tasks",
      })
      set(managementPlanByIdCacheAtom, (prev) => ({ ...prev, [args.id]: plan }))
      set(managementPlansAtom, (prev) => {
        if (!prev?.length) return prev
        const next = prev.map((p) => (p.id === args.id ? plan : p))
        return next
      })
      return plan
    } catch (err) {
      set(managementPlanByIdErrorAtom, toError(err))
      return undefined
    } finally {
      set(managementPlanByIdLoadingAtom, false)
    }
  }
)

export const tasksListAtom = atom<ListResult<Task> | null>(null)
export const tasksLoadingAtom = atom(false)
export const tasksErrorAtom = atom<Error | null>(null)
export const refreshTasksAtom = atom(
  null,
  async (get, set, args?: { page?: number; perPage?: number; sort?: string; filter?: string }) => {
    if (get(tasksLoadingAtom)) return
    set(tasksLoadingAtom, true)
    set(tasksErrorAtom, null)
    try {
      const res = await listTasks(args?.page ?? 1, args?.perPage ?? 50, {
        sort: args?.sort ?? "-created",
        filter: args?.filter,
      })
      set(tasksListAtom, res)
    } catch (err) {
      set(tasksErrorAtom, toError(err))
    } finally {
      set(tasksLoadingAtom, false)
    }
  }
)

export const timestepsBySimulationAtom = atom<Record<string, Timestep[]>>({})
export const timestepsLoadingAtom = atom(false)
export const timestepsErrorAtom = atom<Error | null>(null)
export const refreshTimestepsAtom = atom(
  null,
  async (get, set, simulationId: string) => {
    if (get(timestepsLoadingAtom)) return get(timestepsBySimulationAtom)[simulationId]
    set(timestepsLoadingAtom, true)
    set(timestepsErrorAtom, null)
    try {
      const res = await listAllTimesteps(simulationId, { sort: "index" })
      set(timestepsBySimulationAtom, (prev) => ({
        ...prev,
        [simulationId]: res,
      }))
      return res
    } catch (err) {
      set(timestepsErrorAtom, toError(err))
      throw err
    } finally {
      set(timestepsLoadingAtom, false)
    }
  }
)

export const simAgentsAtom = atom<SimAgentsResponse | null>(null)
export const simAgentsLoadingAtom = atom(false)
export const simAgentsErrorAtom = atom<Error | null>(null)
export const refreshSimAgentsAtom = atom(null, async (get, set) => {
  if (get(simAgentsLoadingAtom)) return
  set(simAgentsLoadingAtom, true)
  set(simAgentsErrorAtom, null)
  try {
    const res = await fetchSimAgents()
    set(simAgentsAtom, res)
  } catch (err) {
    set(simAgentsErrorAtom, toError(err))
  } finally {
    set(simAgentsLoadingAtom, false)
  }
})

export const simByIdCacheAtom = atom<Record<string, SimByIdResponse>>({})
export const simByIdLoadingAtom = atom(false)
export const simByIdErrorAtom = atom<Error | null>(null)
export const fetchSimByIdAtom = atom(null, async (get, set, id: string) => {
  if (get(simByIdLoadingAtom)) return get(simByIdCacheAtom)[id]
  set(simByIdLoadingAtom, true)
  set(simByIdErrorAtom, null)
  try {
    const res = await fetchSimById(id)
    set(simByIdCacheAtom, (prev) => ({ ...prev, [id]: res }))
    return res
  } catch (err) {
    set(simByIdErrorAtom, toError(err))
    throw err
  } finally {
    set(simByIdLoadingAtom, false)
  }
})

export const simulationResultByRecordIdAtom = atom<Record<string, SimulationResultBase64>>({})
export const simulationResultLoadingAtom = atom(false)
export const simulationResultErrorAtom = atom<Error | null>(null)
export const fetchSimulationResultByRecordIdAtom = atom(
  null,
  async (
    get,
    set,
    args: {
      simulationRecordId: string
      options?: Parameters<typeof fetchSimulationResult>[1]
      forceRun?: boolean
    }
  ) => {
    if (get(simulationResultLoadingAtom))
      return get(simulationResultByRecordIdAtom)[args.simulationRecordId]

    set(simulationResultLoadingAtom, true)
    set(simulationResultErrorAtom, null)

    try {
      const simulationRecordId = args.simulationRecordId
      const sims = get(simulationsAtom)
      const sim =
        sims?.find((s) => s.id === simulationRecordId) ??
        get(simulationByIdCacheAtom)[simulationRecordId] ??
        (await getSimulation(simulationRecordId, { expand: "plan,plan.tasks" }))

      if (!args.forceRun && sim.resultJson) {
        const url = fileUrl(sim, sim.resultJson)
        if (url) {
          const res = (await fetch(url).then((r) => r.json())) as SimulationResultBase64
          set(simulationResultByRecordIdAtom, (prev) => ({
            ...prev,
            [simulationRecordId]: res,
          }))
          return res
        }
      }

      const userOptions = args.options ?? {}
      let defaultModelPath: { agent?: string; } = {}
      const simOptions = sim.options
      // Only pass agent if present in simOptions and not overridden by userOptions
      if (simOptions && typeof simOptions === "object") {
        const opt = simOptions as Record<string, unknown>
        if (
          typeof opt.agent === "string" &&
          !("agent" in userOptions)
        ) {
          defaultModelPath = { agent: opt.agent }
        }
      }

      const res = await runSimulationByRecordId(simulationRecordId, {
        format: "base64",
        ...defaultModelPath,
        ...userOptions,
      })
      set(simulationResultByRecordIdAtom, (prev) => ({
        ...prev,
        [simulationRecordId]: res,
      }))

      // Refetch record to pick up cached resultJson/resultNpz filenames.
      const refreshed = await getSimulation(simulationRecordId, {
        expand: "plan,plan.tasks",
      })
      set(simulationByIdCacheAtom, (prev) => ({
        ...prev,
        [simulationRecordId]: refreshed,
      }))
      set(simulationsAtom, (prev) => {
        if (!prev?.length) return prev
        return prev.map((s) => (s.id === simulationRecordId ? refreshed : s))
      })

      return res
    } catch (err) {
      set(simulationResultErrorAtom, toError(err))
      return undefined
    } finally {
      set(simulationResultLoadingAtom, false)
    }
  }
)

export const meAtom = atom<User | null>(null)
export const meLoadingAtom = atom(false)
export const meErrorAtom = atom<Error | null>(null)

export const refreshMeAtom = atom(null, async (get, set) => {
  if (get(meLoadingAtom)) return get(meAtom)
  set(meLoadingAtom, true)
  set(meErrorAtom, null)
  try {
    const me = await fetchMe()
    set(meAtom, me)
  } catch (err) {
    set(meErrorAtom, toError(err))
    set(meAtom, null)
  } finally {
    set(meLoadingAtom, false)
  }
})

export const loginAtom = atom(
  null,
  async (_get, set, args: { email: string; password: string }) => {
    await loginUser(args.email, args.password)
    await set(refreshMeAtom)
  }
)

export const logoutAtom = atom(null, async (_get, set) => {
  logoutUser()
  set(meAtom, null)
})

export const refreshEcotwinStateAtom = atom(null, async (_get, set) => {
  await Promise.all([
    set(refreshTilesAtom),
    set(refreshSimulationsAtom),
    set(refreshSimAgentsAtom),
    set(refreshManagementPlansAtom),
    set(refreshTasksAtom),
  ])
})
