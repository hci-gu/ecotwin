# PocketBase API Notes

PocketBase owns ECOTWIN records, file storage, and UI-facing simulation routes. Model execution is delegated to the MARELD inference API configured by `SIMULATION_INFERENCE_URL` or `MARELD_API_URL` (default `http://localhost:8000`).

## Simulation Records

`simulations` stores a UI run/configuration.

Relevant fields:

- `options` (json): UI run options.
- `plan` (relation -> `managementPlans`, max 1): management plan to run.
- `inputJson` (json): normalized management-plan snapshot used for the run.
- `simulationId` (text): MARELD run id returned by inference.
- `status` (text): `pending`, `running`, `completed`, or `failed`.
- `resultJson` (file): cached `SimulationResultBase64` response.
- `resultNpz` (file): reserved for future binary result support.

## UI Routes

### `GET /simulation/{simulationRecordId}/run`

Runs a PocketBase simulation record through MARELD inference.

What the route does:

- Loads the `simulations` record and its linked management plan and tile.
- Normalizes enabled management-plan activities into `simulations.inputJson`.
- Reads `landcovers.color_100` as the texture raster.
- Reads `oceanData.depth` as the depth raster.
- Generates `noise_impact.png` from enabled wind farm and sea lane activity polygons.
- Fetches model metadata from inference `GET /v1/models`.
- Builds a model-ready `POST /v1/runs` request.
- Stores the returned run id in `simulations.simulationId`.
- Caches the UI JSON result in `simulations.resultJson`.

Supported query parameters:

- `format=base64` (currently required)
- `maxSteps` / `max_steps`
- `sampleEvery` / `sample_every`
- `includeFinal` / `include_final`
- `tickDurationDays` / `tick_duration_days`
- `startDate` / `start_date`
- `endDate` / `end_date`
- `runs` / `runCount` / `run_count` / `replicates`
- `modelId` / `model`
- `agentSet` / `agent_set` / `agent` / `agents`
- `modelPath` / `model_path`

The route returns the UI `SimulationResultBase64` JSON shape.

### `GET /simulate/agents`

Compatibility route for the current UI model selector. It fetches MARELD `GET /v1/models` and maps each model to:

```json
{
  "name": "baltic-default",
  "kind": "single",
  "files": ["model.npz"],
  "species": ["codfish"]
}
```

## Inference Boundary

The inference API should not know about PocketBase collection names, record IDs, file fields, or cache behavior. PocketBase is the adapter that translates ECOTWIN records into the pure inference contract documented in `../INFERENCE_API_REQUIREMENTS.md`.
