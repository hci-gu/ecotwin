import type { ListResult, RecordModel } from "pocketbase"

import { pb } from "@/lib/pocketbase"
import type {
  Heightmap,
  Landcover,
  ManagementPlan,
  OceanData,
  SimAgentsResponse,
  SimByIdResponse,
  Simulation,
  Task,
  Tile,
} from "@/state/ecotwin-types"

export function fileUrl(record: RecordModel, filename?: string | null) {
  if (!filename) return null
  return pb.files.getURL(record, filename)
}

export async function listTiles(
  page = 1,
  perPage = 30,
  options?: { sort?: string; filter?: string; expand?: string; fields?: string }
) {
  return pb.collection("tiles").getList<Tile>(page, perPage, options)
}

export async function getTile(id: string, options?: { expand?: string; fields?: string }) {
  return pb.collection("tiles").getOne<Tile>(id, options)
}

export async function getTileByXYZ(
  x: number,
  y: number,
  zoom: number,
  options?: { expand?: string; fields?: string }
) {
  const filter = `x = ${x} && y = ${y} && zoom = ${zoom}`
  return pb
    .collection("tiles")
    .getFirstListItem<Tile>(filter, { ...options })
}

export async function createTile(
  data: Partial<Pick<Tile, "name" | "visible" | "x" | "y" | "zoom" | "bbox">>
) {
  return pb.collection("tiles").create<Tile>(data)
}

export async function getHeightmap(id: string) {
  return pb.collection("heightmaps").getOne<Heightmap>(id)
}

export async function getLandcover(id: string) {
  return pb.collection("landcovers").getOne<Landcover>(id)
}

export async function getOceanData(id: string) {
  return pb.collection("oceanData").getOne<OceanData>(id)
}

export async function listSimulations(options?: {
  sort?: string
  filter?: string
  expand?: string
  fields?: string
}) {
  return pb.collection("simulations").getFullList<Simulation>(options)
}

export async function getSimulation(id: string, options?: { expand?: string; fields?: string }) {
  return pb.collection("simulations").getOne<Simulation>(id, options)
}

export async function listManagementPlans(options?: {
  sort?: string
  filter?: string
  expand?: string
  fields?: string
}) {
  return pb.collection("managementPlans").getFullList<ManagementPlan>(options)
}

export async function createManagementPlan(
  data: Partial<Pick<ManagementPlan, "name" | "tile" | "area" | "areaSummary" | "tasks">>
) {
  return pb.collection("managementPlans").create<ManagementPlan>(data)
}

export async function updateManagementPlan(
  id: string,
  data: Partial<Pick<ManagementPlan, "name" | "tile" | "area" | "areaSummary" | "tasks">>
) {
  return pb.collection("managementPlans").update<ManagementPlan>(id, data)
}

export async function deleteManagementPlan(id: string) {
  return pb.collection("managementPlans").delete(id)
}

export async function getManagementPlan(id: string, options?: { expand?: string }) {
  return pb.collection("managementPlans").getOne<ManagementPlan>(id, options)
}

export async function listTasks(
  page = 1,
  perPage = 50,
  options?: { sort?: string; filter?: string; fields?: string }
) {
  return pb.collection("tasks").getList<Task>(page, perPage, options)
}

export async function createTask(
  data: Partial<Pick<Task, "name" | "type" | "start" | "end" | "data">>
) {
  return pb.collection("tasks").create<Task>(data)
}

export async function updateTask(
  id: string,
  data: Partial<Pick<Task, "name" | "type" | "start" | "end" | "data">>
) {
  return pb.collection("tasks").update<Task>(id, data)
}

export async function deleteTask(id: string) {
  return pb.collection("tasks").delete(id)
}

export async function fetchSimAgents() {
  return pb.send<SimAgentsResponse>("/simulate/agents", { method: "GET" })
}

export async function fetchSimById(id: string) {
  return pb.send<SimByIdResponse>(`/simulate/${id}`, { method: "GET" })
}

export async function fetchSimulationResult(
  simulationId: string,
  options?: {
    worldSize?: number
    world_size?: number
    maxSteps?: number
    max_steps?: number
    sampleEvery?: number
    sample_every?: number
    tickDurationDays?: number
    tick_duration_days?: number
    startDate?: string
    start_date?: string
    endDate?: string
    end_date?: string
    includeFinal?: boolean
    include_final?: boolean
    modelPath?: string
    model_path?: string
    agentSet?: string
    agent_set?: string
    agent?: string
    agents?: string
    format?: "base64" | "npz"
  }
) {
  return pb.send<SimByIdResponse>(`/simulate/${simulationId}`, {
    method: "GET",
    query: options,
  })
}

export async function runSimulationByRecordId(
  simulationRecordId: string,
  options?: Parameters<typeof fetchSimulationResult>[1]
) {
  return pb.send<SimByIdResponse>(`/simulation/${simulationRecordId}/run`, {
    method: "GET",
    query: options,
  })
}

export async function createSimulation(
  data: Partial<Pick<Simulation, "plan" | "options" | "simulationId" | "status" | "inputJson">>
) {
  return pb.collection("simulations").create<Simulation>(data)
}

export async function deleteSimulation(id: string) {
  return pb.collection("simulations").delete(id)
}

export async function updateTile(
  id: string,
  data: Partial<Pick<Tile, "name" | "visible">>
) {
  return pb.collection("tiles").update<Tile>(id, data)
}

export async function deleteTile(id: string) {
  return pb.collection("tiles").delete(id)
}

export type { ListResult }
