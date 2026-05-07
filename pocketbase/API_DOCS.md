# API Docs (Client Fetch) — PocketBase + JS SDK

This document describes what a client can **fetch/read** from this PocketBase instance using the official JavaScript SDK.

## Quick Start (JS SDK)

```bash
npm i pocketbase
```

```js
import PocketBase from 'pocketbase'

// Example: http://127.0.0.1:8090 (dev default)
const pb = new PocketBase(process.env.POCKETBASE_URL)
```

## General Fetch Patterns

PocketBase records always include system fields like `id`, `created`, `updated`, `collectionId`, `collectionName`.

Common read methods:

```js
// paginated list
await pb.collection('tiles').getList(1, 30, { sort: '-created' })

// all records (use carefully if the collection can grow)
await pb.collection('tiles').getFullList({ sort: '-created' })

// fetch one by id
await pb.collection('tiles').getOne('RECORD_ID')

// fetch first matching record (throws if none)
await pb.collection('tiles').getFirstListItem('x = 10 && y = 12 && zoom = 6')
```

Useful query options:

- `filter`: PocketBase filter expression string (ex: `zoom = 6 && x = 10 && y = 12`)
- `sort`: field name(s) (ex: `-created`, `index`, `-index`)
- `expand`: comma-separated relation fields to expand (ex: `heightmap,landcover,oceanData`)
- `fields`: limit returned fields (ex: `"id,x,y,zoom,satellite"`)

### Fetching Files (images/binaries)

File fields store a filename (or array of filenames). Use the SDK to build a URL:

```js
const tile = await pb.collection('tiles').getOne('TILE_ID')
const url = pb.files.getUrl(tile, tile.satellite)
```

## Collections (Public Read)

All collections below are publicly readable (`list`/`view` rules are open), unless noted otherwise.
In PocketBase terms: empty rule string (`""`) means public, while `null` means superuser-only.

### `tiles`

Represents a map tile and its associated assets.

Fields:

- `x` (number)
- `y` (number)
- `zoom` (number)
- `bbox` (json)
- `metersPerPixel` (number)
- `name` (text)
- `satellite` (file, PNG)
- `heightmap` (relation → `heightmaps`, max 1)
- `landcover` (relation → `landcovers`, max 1)
- `oceanData` (relation → `oceanData`, max 1)
- `simulations` (relation → `simulations`, any)

Example: fetch a tile and expand its related assets:

```js
const tile = await pb
  .collection('tiles')
  .getFirstListItem('x = 10 && y = 12 && zoom = 6', {
    expand:
      'heightmap,landcover,oceanData',
  })

const satelliteUrl = tile.satellite
  ? pb.files.getUrl(tile, tile.satellite)
  : null
```

### `heightmaps`

Heightmap assets.

Fields:

- `original` (file)
- `heightmap` (file)
- `minHeight` (number)
- `maxHeight` (number)

Example:

```js
const hm = await pb.collection('heightmaps').getOne('HEIGHTMAP_ID')
const heightmapUrl = hm.heightmap ? pb.files.getUrl(hm, hm.heightmap) : null
```

### `landcovers`

Landcover assets + derived data.

Fields:

- `original` (file)
- `color` (file)
- `texture` (file)
- `color_100` (file)
- `texture_100` (file)
- `coverage` (json)

Notes:

- `coverage` is computed server-side from `color_100`.
- Delete is **superuser-only** (read is public).

Example:

```js
const landcover = await pb.collection('landcovers').getOne('LANDCOVER_ID')
const color100Url = landcover.color_100
  ? pb.files.getUrl(landcover, landcover.color_100)
  : null
```

### `oceanData`

Ocean-related raster/vector assets for a tile.

Fields:

- `surface_elevation` (file)
- `water_temperature` (file)
- `water_velocity` (file)
- `depth` (file)

Example:

```js
const ocean = await pb.collection('oceanData').getOne('OCEAN_ID')
const depthUrl = ocean.depth ? pb.files.getUrl(ocean, ocean.depth) : null
```

### `simulations`

A simulation run/config.

Fields:

- `options` (json)
- `plan` (relation → `managementPlans`, max 1)
- `simulationId` (text) — UUID returned by `POST /simulate/upload`
- `resultJson` (file) — cached response for `GET /simulate/<simulation_id>?format=base64`
- `resultNpz` (file) — cached response for `GET /simulate/<simulation_id>?format=npz`

Example: fetch a simulation record and expand its plan/tasks:

```js
const sim = await pb.collection('simulations').getOne('SIM_RECORD_ID', {
  expand: 'plan,plan.tasks',
})
```

### `timesteps`

Time series entries for a simulation.

Fields:

- `index` (number) — timestep index/order
- `data` (json) — timestep payload
- `simulation` (relation → `simulations`, max 1)

Example:

```js
await pb.collection('timesteps').getList(1, 100, {
  filter: 'simulation = "SIM_ID"',
  sort: 'index',
})
```

### `managementPlans`

A management plan groups a set of tasks and can be linked from a `simulation`.

Fields:

- `name` (text)
- `area` (json) — selected plan/activity geometry or map-selection payload
- `areaSummary` (json) — denormalized summary for the selected area
- `tasks` (relation → `tasks`, any)

Example:

```js
const plan = await pb.collection('managementPlans').getOne('PLAN_ID', {
  expand: 'tasks',
})
```

### `tasks`

Tasks that can be attached to a management plan.

Fields:

- `name` (text)
- `type` (select: `"fishing"` | `"construction"` | `"windFarm"` | `"seaLane"` | `"trawlArea"`)
- `start` (date, used when `data.timing` is `"scheduled"`)
- `end` (date, used when `data.timing` is `"scheduled"`)
- `data` (json) — task parameters and impact metadata, for example:
  - `timing`: `"scheduled"` or `"constant"`
  - `objective`
  - `description`
  - `cost`
  - `revenue`
  - `status`
  - `targetScope`: `"wholeTile"` or `"polygon"`
  - `area` / `areaSummary` when `targetScope` is `"polygon"`
  - `speciesEffortMultipliers` for fishing, keyed by species id (`phytoplankton`, `zooplankton`, `pelagicFish`, `codfish`, `porpoises`, `seabirds`)
  - `construction` for construction activities (`category`, `intensity`, optional `description`)

Example:

```js
const tasks = await pb.collection('tasks').getList(1, 50, { sort: '-created' })
```

## Users (Auth Collection)

Collection: `users`

Read access is restricted to the authenticated user (`id = @request.auth.id`).

Fields:

- `username` (text)
- `name` (text)
- `avatar` (file)

Example: login and fetch your own user record:

```js
await pb.collection('users').authWithPassword('email@example.com', 'password')
const me = await pb.collection('users').getOne(pb.authStore.model.id)
```

## Custom HTTP Endpoints (Reverse Proxy)

These routes are served by PocketBase but forwarded to an upstream service.

### Client-friendly: run by PocketBase simulation record id

If you already have a PocketBase `simulations` record id (the record `id`), you can run everything with a single request:

`GET /simulation/<simulation_record_id>/run`

What it does:

- Loads the `simulations` record.
- Loads the linked `managementPlans` record from `simulations.plan`.
- Loads the linked tile from `managementPlans.tile`.
- Uploads the tile assets (`tiles.satellite` as `texture`, `tiles.oceanData.depth` as `depth`) to `POST /simulate/upload`.
- Stores the returned upstream UUID into `simulations.simulationId` (and clears cached result files).
- Runs `GET /simulate/<simulation_id>` and forwards the response (also cached into `resultJson` / `resultNpz`).

All query parameters (`format`, `worldSize`, `maxSteps`, etc.) are forwarded to the upstream run request. If `maxSteps` / `max_steps` is not provided, the bridge derives it from the management plan timeline: the earliest scheduled activity start to the latest scheduled activity end, with one simulation tick per day by default. If `sampleEvery` / `sample_every` is not provided, it is chosen adaptively to keep playback samples bounded.

The workflow is:

1. Upload a map (texture + depth) to create a `simulation_id`.
2. Run the simulation and retrieve sampled per-cell biomass snapshots.

The upstream stores uploaded files under `maps/<simulation_id>/map.png` and `maps/<simulation_id>/depth.png`.

Important model-loading note:

- Current trained agents are usually saved as `{generation}_${species}_{fitness}.npy.npz`.
- Examples:
  - `10_$cod_9079.34.npy.npz`
  - `8_$sprat_14953.08.npy.npz`
  - `12_$sprat__a0_14568.62.npy.npz`
- If you are using multiple age groups, the `species` part is the full acting species id, not just the base species name.

### 1) Create simulation

**Route**

`POST /simulate/upload`

**Form fields**

- `texture`: file (saved as `map.png`)
- `depth`: file (saved as `depth.png`)
- `options`: JSON string (see “Options” below)

**Response (JSON)**

- `id`: string UUID (`simulation_id`)

### 2) Run simulation + fetch biomass samples

**Route**

`GET /simulate/<simulation_id>`

This runs a simulation using the uploaded map and returns a sampled biomass time series.

#### Sampling behavior

- The simulation runs for `settings.max_steps` environment steps.
- Biomass grids are sampled every `sampleEvery` steps (default `10`).
- The biomass snapshot is taken from the _unpadded_ world grid: `world[1:-1, 1:-1, :]`.

#### Query parameters

- `worldSize` / `world_size` (int): overrides `Settings.world_size` (default `50`).
- `maxSteps` / `max_steps` (int): overrides `Settings.max_steps` (default `3000`).
- `sampleEvery` / `sample_every` (int): sample interval (default `10`).
- `includeFinal` / `include_final` (bool): include final sample (default `true`).
- `format` (string): output format:
  - `base64` (default): JSON with base64-encoded raw bytes
  - `npz`: returns `application/octet-stream` containing a compressed NumPy `.npz`
- `agentSet` / `agent_set` / `agent` / `agents` (string): load models from `agents/<agentSet>/`.
  - if the folder contains exactly 1 `.npy.npz` / `.npz`, that model is reused for all acting species
  - if it contains multiple files, the API infers species from the filename and requires one model per acting species
  - current training output names look like `{generation}_${species}_{fitness}.npy.npz`
  - with `age_groups=1`, the acting species are `phytoplankton`, `zooplankton`, `pelagicFish`, `codfish`, `porpoises`, `seabirds`
  - with `age_groups=3`, the acting species are:
    - `phytoplankton__a0`, `phytoplankton__a1`, `phytoplankton__a2`
    - `zooplankton__a0`, `zooplankton__a1`, `zooplankton__a2`
    - `pelagicFish__a0`, `pelagicFish__a1`, `pelagicFish__a2`
  - in that case, a multi-file agent set must contain filenames for those full age-group names, for example `12_$codfish__a2_1234.5.npy.npz`
- `modelPath` / `model_path` (string): path to a `.npy.npz` / `.npz` model file. This is loaded once and reused for all acting species.
- if neither `agentSet` nor `modelPath` is provided, the server falls back to a hardcoded local default model folder. For predictable requests, pass one of them explicitly.

#### Response format: `format=base64` (default)

**Response (JSON)**

- `simulation_id`: string
- `world_size`: int
- `species`: array of strings (order of the last axis in `biomass`)
  - this is `["phytoplankton", "zooplankton", "pelagicFish", "codfish", "porpoises", "seabirds"]` when `age_groups=1`
  - when `age_groups>1`, this expands to age-group names such as `codfish__a0`, `codfish__a1`, ...
- `sample_every`: int
- `include_final`: bool
- `tick_duration_days`: int, when supplied by a plan-driven run
- `start_date`: string, when supplied by a plan-driven run
- `end_date`: string, when supplied by a plan-driven run
- `dtype`: string (currently `float32`)
- `shape`: array `[N, H, W, S]`
- `steps`: array of ints (step index for each snapshot, length `N`)
- `fitness`: float
- `episode_length`: int (number of environment steps completed)
- `end_reason`: string (if the world terminated early)
- `biomass_b64`: base64 string of the raw `biomass` tensor bytes in C-order
- `biomass_summary`: optional compact chart summary. Mock runs include five replicates by default and return:
  - `run_count`: number of runs in the ensemble
  - `confidence_level`: confidence level for the interval, e.g. `0.95`
  - `ci_method`: interval method, e.g. `t-interval`
  - `normalization`: e.g. `relative_to_initial`
  - `grouping`: e.g. `functional_group`
  - `steps`: sampled step indexes for the summary
  - `groups`: chart series names
  - `group_species`: source species used for each group
  - `mean`, `ci_low`, `ci_high`: matrices shaped `[group][step]`

`biomass_b64` remains a single playback tensor. For mock ensembles it contains the per-cell mean over the five runs; individual replicate tensors are not returned.

**How to decode `biomass_b64` (Python)**

```python
import base64
import numpy as np

# response_json = requests.get(...).json()
shape = response_json["shape"]          # [N, H, W, S]
raw = base64.b64decode(response_json["biomass_b64"])
biomass = np.frombuffer(raw, dtype=np.float32).reshape(shape)
steps = np.asarray(response_json["steps"], dtype=np.int32)
species = response_json["species"]
```

#### Response format: `format=npz`

Returns `application/octet-stream` containing a compressed NumPy archive with:

- `biomass`: `float32` array shaped `(N, H, W, S)`
- `steps`: `int32` array shaped `(N,)`
- `species`: array of strings
- `world_size`: `int32` array shaped `(1,)`
- `sample_every`: `int32` array shaped `(1,)`

**How to read (Python)**

```python
import io
import numpy as np

# content = requests.get(...).content
with np.load(io.BytesIO(content)) as z:
    biomass = z["biomass"]
    steps = z["steps"]
    species = z["species"].tolist()
```

### PocketBase caching

When you call `GET /simulate/<simulation_id>` through this PocketBase instance, the response is cached on the matching `simulations` record:

- `simulations.simulationId` stores the UUID.
- `simulations.resultJson` caches `format=base64`.
- `simulations.resultNpz` caches `format=npz`.

Example: fetch the cached `resultNpz` file URL after running:

```js
const sim = await pb
  .collection('simulations')
  .getFirstListItem(`simulationId = "${simulationId}"`)

const npzUrl = sim.resultNpz ? pb.files.getUrl(sim, sim.resultNpz) : null
```

Use plain `fetch(...)` against your PocketBase base URL, or (if you prefer) the SDK low-level request helper:

```js
// option A: plain fetch
const { id: simulationId } = await fetch(`${pb.baseUrl}/simulate/upload`, {
  method: 'POST',
  body: formData, // includes texture, depth, options
}).then((r) => r.json())

// run + retrieve results (this also stores the response in PocketBase)
const result = await fetch(
  `${pb.baseUrl}/simulate/${simulationId}?format=base64`
).then((r) => r.json())
```

## Options

`options` is a JSON object passed to `POST /simulate/upload`. For plan-driven runs through `GET /simulation/{recordId}/run`, PocketBase stores the normalized plan input on `simulations.inputJson` and sends it under `options.managementPlan`.

Common keys:

- `world_size` / `worldSize`
- `max_steps` / `maxSteps`
- `age_groups` / `ageGroups`
- `age_step_interval` / `ageStepInterval`

Unrecognized keys are ignored.

### Plan-driven simulation input

`GET /simulation/{recordId}/run` validates the selected management plan before upload. It requires a tile with landcover and ocean depth, at least one activity, and activity data that can be normalized for the simulator.

The stored `simulations.inputJson` snapshot has this shape. `planStart` and `planEnd` are virtual management-plan fields derived from the minimum scheduled task `start` and maximum scheduled task `end`.

```json
{
  "version": 2,
  "planId": "PLAN_ID",
  "planName": "Plan name",
  "planStart": "2026-01-01",
  "planEnd": "2026-12-31",
  "durationDays": 364,
  "tickDurationDays": 1,
  "simulationTicks": 364,
  "sampleEvery": 4,
  "tileId": "TILE_ID",
  "tileName": "Tile name",
  "tileBbox": "minLng,minLat,maxLng,maxLat",
  "tileAreaKm2": 123.4,
  "activities": [
    {
      "id": "TASK_ID",
      "type": "fishing",
      "timing": "scheduled",
      "start": "2026-01-01",
      "end": "2026-12-31",
      "targetScope": "polygon",
      "area": { "type": "Polygon", "coordinates": [] },
      "areaSummary": { "areaKm2": 12.3 },
      "affectedSpecies": ["phytoplankton", "zooplankton", "pelagicFish", "codfish", "porpoises", "seabirds"],
      "speciesEffortMultipliers": {
        "phytoplankton": 1,
        "zooplankton": 1,
        "pelagicFish": 1,
        "codfish": 0.8,
        "porpoises": 1,
        "seabirds": 1
      }
    }
  ]
}
```

Age-group behavior:

- `age_groups=1` keeps the default learned species: `phytoplankton`, `zooplankton`, `pelagicFish`, `codfish`, `porpoises`, `seabirds`
- `age_groups>1` expands both the learned species set and the output tensor channels
- if you use `agentSet` with multiple files, filenames must match the expanded acting species names, not only the base names

### Example: `age_groups=3`

Example upload request:

```bash
curl -X POST http://localhost:4000/simulate/upload \
  -F "texture=@/path/to/map.png" \
  -F "depth=@/path/to/depth.png" \
  -F 'options={"world_size":50,"max_steps":3000,"age_groups":3,"age_step_interval":50}'
```

Example agent-set layout for that run:

```text
agents/my_age3_set/
  12_$sprat__a0_14568.62.npy.npz
  12_$sprat__a1_13210.11.npy.npz
  12_$sprat__a2_15100.44.npy.npz
  12_$herring__a0_12001.50.npy.npz
  12_$herring__a1_11888.20.npy.npz
  12_$herring__a2_12555.90.npy.npz
  12_$cod__a0_9800.25.npy.npz
  12_$cod__a1_10010.75.npy.npz
  12_$cod__a2_10333.40.npy.npz
```

Example simulation request using that agent set:

```bash
curl "http://localhost:4000/simulate/<simulation_id>?agentSet=my_age3_set&sampleEvery=25&format=npz"
```

Expected response metadata:

- `species` will contain all age-group-expanded species
- with `age_groups=3`, that means:
  - `phytoplankton__a0`, `phytoplankton__a1`, `phytoplankton__a2`
  - `zooplankton__a0`, `zooplankton__a1`, `zooplankton__a2`
  - `pelagicFish__a0`, `pelagicFish__a1`, `pelagicFish__a2`
  - `codfish__a0`, `codfish__a1`, `codfish__a2`
  - `porpoises__a0`, `porpoises__a1`, `porpoises__a2`
  - `seabirds__a0`, `seabirds__a1`, `seabirds__a2`
- the last axis of `biomass` follows that `species` order exactly

## List available agent sets

**Route**

`GET /simulate/agents`

Returns an array of objects describing subfolders under `agents/`.

Each object has:

- `name`: folder name
- `kind`: one of:
  - `empty`: folder contains no supported model files
  - `single`: exactly one model file; API will reuse it for all acting species
  - `multi`: multiple model files; `species` lists the species successfully inferred from filenames
  - `error`: the folder could not be summarized
- `files`: model filenames found in the folder
- `species`: species inferred from those filenames under the server's current species configuration
- `error`: only present when `kind=error`

This endpoint is useful for checking whether the server can infer species from your filenames. If you plan to run with `age_groups>1`, make sure your filenames use the expanded acting species names shown above.
