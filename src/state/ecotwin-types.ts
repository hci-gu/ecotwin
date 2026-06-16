import type { RecordModel } from "pocketbase"

export type Id = string
export type TileAssetStatus = "pending" | "processing" | "ready" | "failed" | "skipped"

export type ManagementPlanAreaSummary = {
  areaKm2?: number
  gridCells?: {
    width?: number
    height?: number
  }
  centroid?: {
    lat?: number
    lng?: number
  }
  [key: string]: unknown
}

export type Tile = RecordModel & {
  name?: string
  visible?: boolean
  x: number
  y: number
  zoom: number
  bbox?: unknown
  metersPerPixel?: number
  landcoverStatus?: TileAssetStatus
  oceanDataStatus?: TileAssetStatus
  satellite?: string
  heightmap?: Id
  landcover?: Id
  oceanData?: Id
  expand?: {
    heightmap?: Heightmap
    landcover?: Landcover
    oceanData?: OceanData
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
  inputJson?: unknown
  status?: "pending" | "running" | "completed" | "failed"
  plan?: Id
  simulationId?: string
  resultJson?: string
  resultNpz?: string
  expand?: {
    plan?: ManagementPlan
    [key: string]: unknown
  }
}

export type SimAgent = {
  name: string
  kind?: "empty" | "single" | "multi" | "error"
  files?: string[]
  species?: string[]
  error?: string
  modelPath?: string
  model_path?: string
  path?: string
}

export type SimAgentsResponse = SimAgent[]

export type SimulationBiomassSummary = {
  run_count: number
  confidence_level: number
  ci_method: string
  normalization: string
  grouping: string
  steps: number[]
  groups: string[]
  group_species?: string[][]
  mean: number[][]
  ci_low: number[][]
  ci_high: number[][]
}

export type SimulationResultBase64 = {
  simulation_id: string
  world_size: number
  species: string[]
  sample_every: number
  include_final: boolean
  tick_duration_days?: number
  start_date?: string
  end_date?: string
  dtype: string
  shape: number[]
  steps: number[]
  fitness: number
  episode_length: number
  end_reason?: string
  biomass_b64: string
  biomass_summary?: SimulationBiomassSummary
}

export type SimByIdResponse = SimulationResultBase64

export type ManagementPlan = RecordModel & {
  name: string
  tile?: Id
  area?: unknown
  areaSummary?: ManagementPlanAreaSummary
  tasks?: Id[]
  expand?: {
    tile?: Tile
    tasks?: Task[]
    [key: string]: unknown
  }
}

export type TaskType =
  | "fishing"
  | "construction"
  | "windFarm"
  | "seaLane"
  | "trawlArea"

export type TaskTiming = "scheduled" | "constant"

export type TaskData = {
  timing?: TaskTiming
  objective?: string
  description?: string
  cost?: number
  revenue?: number
  status?: string
  targetScope?: "wholeTile" | "polygon"
  speciesEffortMultipliers?: Record<string, number>
  construction?: {
    category?: string
    intensity?: number
    description?: string
  }
  area?: unknown
  areas?: Array<{
    area?: unknown
    areaSummary?: {
      areaKm2?: number
      vertexCount?: number
      centroid?: {
        lat?: number
        lng?: number
      }
      bbox?: {
        minLng?: number
        minLat?: number
        maxLng?: number
        maxLat?: number
      }
    }
  }>
  areaSummary?: {
    areaKm2?: number
    vertexCount?: number
    centroid?: {
      lat?: number
      lng?: number
    }
    bbox?: {
      minLng?: number
      minLat?: number
      maxLng?: number
      maxLat?: number
    }
  }
  [key: string]: unknown
}

export type Task = RecordModel & {
  name: string
  type: TaskType
  start?: string
  end?: string
  data?: TaskData
}
