import type { RecordModel } from "pocketbase"

export type Id = string

export type Tile = RecordModel & {
  name?: string
  x: number
  y: number
  zoom: number
  bbox?: unknown
  metersPerPixel?: number
  satellite?: string
  heightmap?: Id
  landcover?: Id
  oceanData?: Id
  simulations?: Id[]
  expand?: {
    heightmap?: Heightmap
    landcover?: Landcover
    oceanData?: OceanData
    simulations?: Simulation[]
    [key: string]: unknown
  }
}

export type Heightmap = RecordModel & {
  original?: string
  heightmap?: string
  minHeight?: number
  maxHeight?: number
}

export type Landcover = RecordModel & {
  original?: string
  color?: string
  texture?: string
  color_100?: string
  texture_100?: string
  coverage?: unknown
}

export type OceanData = RecordModel & {
  surface_elevation?: string
  water_temperature?: string
  water_velocity?: string
  depth?: string
}

export type Simulation = RecordModel & {
  options?: unknown
  plan?: Id
  simulationId?: string
  resultJson?: string
  resultNpz?: string
  expand?: {
    plan?: ManagementPlan
    [key: string]: unknown
  }
}

export type Timestep = RecordModel & {
  index: number
  data?: unknown
  simulation: Id
}

export type SimAgent = {
  name: string
  kind?: "multi" | "single"
  species?: string[]
  modelPath?: string
  model_path?: string
  path?: string
}

export type SimAgentsResponse = string[] | SimAgent[]
export type SimulationResultBase64 = {
  simulation_id: string
  world_size: number
  species: string[]
  sample_every: number
  include_final: boolean
  dtype: string
  shape: number[]
  steps: number[]
  fitness: number
  episode_length: number
  end_reason?: string
  biomass_b64: string
}

export type SimByIdResponse = SimulationResultBase64

export type ManagementPlan = RecordModel & {
  name: string
  tasks?: Id[]
  expand?: {
    tasks?: Task[]
    [key: string]: unknown
  }
}

export type Task = RecordModel & {
  name: string
  type: "landcover" | "fishingPolicy"
  start?: string
  end?: string
  data?: unknown
}

export type User = RecordModel & {
  email?: string
  username?: string
  name?: string
  [key: string]: unknown
}
