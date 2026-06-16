# Simulation API Docs

The ECOTWIN UI now runs simulations through the PocketBase MARELD bridge:

```text
GET /simulation/{simulationRecordId}/run?format=base64
```

PocketBase resolves the simulation record, linked management plan, tile rasters, and selected model, then calls the pure inference API:

```text
GET /v1/models
POST /v1/runs
```

The returned inference result is translated into the UI `SimulationResultBase64` shape and cached on the `simulations` record.

See:

- `API_REQUIREMENTS.md` for the application/orchestrator boundary.
- `INFERENCE_API_REQUIREMENTS.md` for the pure inference API contract.
- `pocketbase/API_DOCS.md` for PocketBase route details.
