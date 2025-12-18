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
  Timestep,
  User,
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

export async function createManagementPlan(data: Pick<ManagementPlan, "name">) {
  return pb.collection("managementPlans").create<ManagementPlan>(data)
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

export async function listTimesteps(
  simulationId: string,
  page = 1,
  perPage = 100,
  options?: { sort?: string; fields?: string }
) {
  return pb.collection("timesteps").getList<Timestep>(page, perPage, {
    filter: `simulation = "${simulationId}"`,
    sort: "index",
    ...options,
  })
}

export async function listAllTimesteps(simulationId: string, options?: {
  sort?: string
  fields?: string
}) {
  return pb.collection("timesteps").getFullList<Timestep>({
    filter: `simulation = "${simulationId}"`,
    sort: "index",
    ...options,
  })
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
    includeFinal?: boolean
    include_final?: boolean
    modelPath?: string
    model_path?: string
    format?: "base64" | "npz"
  }
) {
  return pb.send<SimByIdResponse>(`/simulate/${simulationId}`, {
    method: "GET",
    query: options,
  })
}

export async function fetchSimPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`
  return pb.send<SimByIdResponse>(`/simulate${normalized}`, { method: "GET" })
}

export async function createSimulation(
  data: Partial<Pick<Simulation, "plan" | "options" | "simulationId">>
) {
  return pb.collection("simulations").create<Simulation>(data)
}

export async function simulateUpload(body: BodyInit) {
  return pb.send("/simulate/upload", { method: "POST", body })
}

export async function updateTile(id: string, data: Partial<Pick<Tile, "simulations">>) {
  return pb.collection("tiles").update<Tile>(id, data)
}

export async function loginUser(email: string, password: string) {
  return pb.collection("users").authWithPassword(email, password)
}

export function logoutUser() {
  pb.authStore.clear()
}

export async function fetchMe() {
  const id = pb.authStore.record?.id
  if (!id) throw new Error("Not authenticated")
  return pb.collection("users").getOne<User>(id)
}

export type { ListResult }
