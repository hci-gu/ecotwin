# Pure Inference API Requirements

This document is only for the model inference service. It describes a model-facing API that receives already-prepared inputs, runs ecological inference, and returns model outputs.

## Scope

The inference service is responsible for:

- Listing available models or agent sets.
- Running a model from prepared raster inputs.
- Applying model-ready pressures, masks, species settings, and time settings.
- Returning sampled biomass tensors and optional summary statistics.
- Reporting run status if execution is asynchronous.

The caller is responsible for preparing model-ready inputs before calling this API. The inference service should not depend on upstream storage, routing, workflow, or naming conventions.

## Endpoints

### `GET /health`

Readiness endpoint.

Response:

```json
{ "ok": true }
```

### `GET /v1/models`

Lists available model configurations.

Response:

```json
[
  {
    "id": "baltic-default",
    "name": "Baltic default",
    "kind": "agent_set",
    "species": [
      "phytoplankton",
      "zooplankton",
      "pelagicFish",
      "codfish",
      "porpoises",
      "seabirds"
    ],
    "supports_age_groups": false,
    "files": ["10_$codfish_9079.34.npy.npz"]
  }
]
```

Required fields:

- `id`: stable model identifier.
- `name`: human-readable label.
- `kind`: model category, for example `single_model`, `agent_set`, or `ensemble`.
- `species`: output species IDs supported by this model.

Optional fields:

- `supports_age_groups`
- `files`
- `description`
- `version`

If model discovery is not implemented yet, return an empty array.

### `POST /v1/runs`

Creates and runs, or creates and queues, an inference run.

Accepted execution modes:

- Synchronous: return `200` with `status: "completed"` and a result.
- Asynchronous: return `202` with `status: "queued"` or `status: "running"` and a `run_id`.

Request content type: `multipart/form-data`

Required form fields:

- `request`: JSON `ModelRunRequest`.
- `texture`: model-ready raster file.
- `depth`: model-ready depth raster file.

Optional form fields:

- `noise_impact`: grayscale noise-impact raster file where black is no impact and white is max impact.
- `mask`: repeated raster mask files. Each file must match one entry in `request.masks[]`.

Synchronous response:

```json
{
  "run_id": "run-123",
  "status": "completed",
  "result": {}
}
```

Asynchronous response:

```json
{
  "run_id": "run-123",
  "status": "queued"
}
```

### `GET /v1/runs/{run_id}`

Required if `POST /v1/runs` can return before completion.

Running response:

```json
{
  "run_id": "run-123",
  "status": "running",
  "progress": 0.42
}
```

Completed response:

```json
{
  "run_id": "run-123",
  "status": "completed",
  "result": {}
}
```

Failed response:

```json
{
  "run_id": "run-123",
  "status": "failed",
  "error": {
    "code": "MODEL_FAILED",
    "message": "Human-readable explanation"
  }
}
```

## `ModelRunRequest`

The `request` form field must be JSON with this shape.

```json
{
  "run_id": "run-123",
  "model": {
    "id": "baltic-default",
    "agent_set": "optional-agent-set",
    "model_path": "optional-model-path"
  },
  "grid": {
    "width": 50,
    "height": 50,
    "bbox": [11.1, 57.7, 11.2, 57.8],
    "coordinate_system": "EPSG:4326"
  },
  "time": {
    "max_steps": 365,
    "sample_every": 4,
    "include_final": true,
    "tick_duration_days": 1,
    "start_date": "2026-01-01",
    "end_date": "2027-01-01"
  },
  "species": [
    "phytoplankton",
    "zooplankton",
    "pelagicFish",
    "codfish",
    "porpoises",
    "seabirds"
  ],
  "masks": [
    {
      "id": "mask-trawling-1",
      "file": "mask-trawling-1.png",
      "width": 50,
      "height": 50
    }
  ],
  "pressures": [
    {
      "id": "pressure-1",
      "type": "species_effort_multiplier",
      "time_window": { "start_step": 0, "end_step": 365 },
      "scope": { "kind": "mask", "mask_id": "mask-trawling-1" },
      "parameters": {
        "species_effort_multipliers": {
          "codfish": 0.8
        }
      }
    }
  ],
  "output": {
    "dtype": "float32",
    "tensor_order": "frame,row,column,species",
    "include_summary": true,
    "summary_normalization": "relative_to_initial",
    "replicates": 20
  }
}
```

Required top-level fields:

- `model`
- `grid`
- `time`
- `species`
- `output`

Optional top-level fields:

- `run_id`; if omitted, the service must generate one.
- `masks`
- `pressures`

Unknown keys must be ignored unless they make the request ambiguous.

## Raster Inputs

`texture`:

- Model-ready landcover or habitat raster.
- PNG is required for the first implementation.
- Should match `grid.width` and `grid.height`, unless the service explicitly supports resampling.

`depth`:

- Model-ready depth raster.
- PNG is required for the first implementation.
- Must use the same dimensions, orientation, and bounds as `texture`.

`mask`:

- Optional repeated PNG files.
- Each mask is single-channel or grayscale.
- White or non-zero pixels mean inside the mask.
- Each mask file must be referenced by `request.masks[].file`.
- `request.masks[].id` is the stable ID used by `pressure.scope.mask_id`.

Raster orientation must be documented by the service. The expected tensor output orientation is row-major from north/top to south/bottom and column-major from west/left to east/right.

## Pressure Contract

A pressure is a model-ready effect applied to a scope over a time window.

Required fields:

- `id`: opaque pressure identifier.
- `type`: model pressure type.
- `time_window.start_step`: inclusive model step.
- `time_window.end_step`: inclusive or exclusive must be documented by the service.
- `scope.kind`: `whole_grid` or `mask`.
- `parameters`: pressure-specific JSON object.

Recommended pressure types:

- `species_effort_multiplier`: species-specific multiplier map.
- `construction_disturbance`: scalar disturbance intensity.
- `noise_pressure`: scalar noise intensity.
- `rotor_pressure`: scalar rotor/collision intensity.
- `trawling_pressure`: scalar seabed pressure intensity.

The service may support additional pressure types. Unsupported pressure types must return `422`.

## Result Envelope

All completed run responses should include:

```json
{
  "run_id": "run-123",
  "status": "completed",
  "result": {
    "run_id": "run-123",
    "world_size": 50,
    "species": [
      "phytoplankton",
      "zooplankton",
      "pelagicFish",
      "codfish",
      "porpoises",
      "seabirds"
    ],
    "sample_every": 4,
    "include_final": true,
    "tick_duration_days": 1,
    "start_date": "2026-01-01",
    "end_date": "2027-01-01",
    "dtype": "float32",
    "shape": [4, 50, 50, 6],
    "steps": [0, 120, 240, 365],
    "fitness": 1234.5,
    "episode_length": 365,
    "end_reason": "completed",
    "biomass_b64": "base64_encoded_float32_tensor",
    "summary": {
      "run_count": 20,
      "confidence_level": 0.95,
      "ci_method": "t-interval",
      "normalization": "relative_to_initial",
      "grouping": "functional_group",
      "steps": [0, 120, 240, 365],
      "groups": ["Phytoplankton", "Zooplankton"],
      "group_species": [["phytoplankton"], ["zooplankton"]],
      "mean": [[1, 1.05, 1.1, 1.12], [1, 0.98, 0.95, 0.94]],
      "ci_low": [[1, 1.01, 1.02, 1.03], [1, 0.94, 0.9, 0.88]],
      "ci_high": [[1, 1.09, 1.18, 1.2], [1, 1.02, 1.0, 1.01]]
    }
  }
}
```

Required `result` fields:

- `run_id`
- `world_size`
- `species`
- `sample_every`
- `include_final`
- `dtype`
- `shape`
- `steps`
- `fitness`
- `episode_length`
- `biomass_b64`

Optional but recommended `result` fields:

- `tick_duration_days`
- `start_date`
- `end_date`
- `end_reason`
- `summary`

## Tensor Requirements

- `dtype` must be `float32`.
- `shape` must be `[N, H, W, S]`.
- `steps.length` must equal `N`.
- `species.length` must equal `S`.
- `biomass_b64` must decode to exactly `N * H * W * S * 4` bytes.
- Tensor order must be C-order `[frame][row][column][species]`.
- `steps` must be sorted ascending.
- The final tensor axis order must exactly match the `species` array.
- Biomass values must be finite and non-negative.
- No `NaN`, `Infinity`, or negative sentinel values.

## Summary Requirements

`summary` is optional but recommended for efficient charting.

If present:

- `summary.steps.length` must match the second dimension of `mean`, `ci_low`, and `ci_high`.
- `groups.length` must match the first dimension of `mean`, `ci_low`, and `ci_high`.
- `mean`, `ci_low`, and `ci_high` must be shaped `[group][step]`.
- `group_species` should map each summary group to source species IDs.
- `normalization` should state whether values are absolute or relative.

## Error Contract

Use clear HTTP statuses:

- `400`: malformed request, missing required files, invalid JSON.
- `404`: unknown `run_id` or model ID.
- `409`: run state conflict.
- `422`: unsupported model input, species, pressure, or parameter value.
- `500`: unexpected model or service failure.
- `503`: service unavailable or overloaded.

Error response:

```json
{
  "error": "MODEL_FAILED",
  "message": "Human-readable explanation",
  "details": {}
}
```

## Performance Limits

- Return sampled frames only.
- Keep raw tensor size `N * H * W * S * 4` under 100 MB when practical.
- If runs can exceed a few minutes, use asynchronous execution.
- Include `progress` for long asynchronous runs when possible.
- Avoid returning per-replicate full tensors unless explicitly requested.

## Acceptance Checklist

The inference API is ready when:

- `GET /health` returns `200`.
- `GET /v1/models` returns `200` and a JSON array.
- `POST /v1/runs` accepts `request`, `texture`, `depth`, and optional `mask` files.
- The service either returns a completed result or exposes status via `GET /v1/runs/{run_id}`.
- Completed results include all required result fields.
- `shape[0] === steps.length`.
- `shape[3] === species.length`.
- Decoded `biomass_b64` byte length equals `N * H * W * S * 4`.
- Biomass values are finite and non-negative.
- Unsupported pressure types return `422`.
- A known asymmetric input produces the documented output orientation.
