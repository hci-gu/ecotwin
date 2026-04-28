# ECOTWIN

ECOTWIN is a map-based ecological digital twin prototype. The current app lets users create map tiles, generate tile assets, create management plans for tiles, run simulations, inspect biomass results, and export simulation reports.

## Project Structure

- `src/` - React/Vite frontend.
- `pocketbase/` - PocketBase app, schema migrations, custom hooks, and simulation proxy endpoints.
- `services/tile-populator/` - worker that populates tile landcover and ocean data assets.
- `services/mock-simulation/` - local mock simulation service for development.

## Local Development

Install dependencies with pnpm, then run the services you need:

```bash
pnpm install
pnpm dev
pnpm dev:pocketbase
pnpm dev:tile-populator
```

For a fully local simulation path, run PocketBase in mock mode:

```bash
pnpm dev:pocketbase:mock
```

## Environment

Common environment variables:

- `VITE_MAPBOX_TOKEN` - Mapbox token used by the frontend and PocketBase tile hooks.
- `VITE_POCKETBASE_URL` - PocketBase URL for the frontend, default `http://127.0.0.1:8090`.
- `TILE_POPULATOR_PB_URL` - PocketBase URL for the tile populator.
- `TILE_POPULATOR_PB_EMAIL` / `TILE_POPULATOR_PB_PASSWORD` - superuser credentials for the worker.
- `GOOGLE_EARTH_ENGINE_CREDENTIALS_PATH` or `GOOGLE_EARTH_ENGINE_CREDENTIALS_JSON` - Earth Engine credentials.
- `TILE_POPULATOR_GEOTIFF_PATH` - local GeoTIFF used for depth generation.
- `SIMULATION_MOCK=1` - enables PocketBase mock simulation responses.

Use `services/tile-populator/.env.example` as the worker environment template.

## Verification

```bash
./node_modules/.bin/tsc -b --pretty false
./node_modules/.bin/eslint src services --max-warnings=0
cd pocketbase && go test ./...
```

The root `pnpm` scripts wrap the same frontend checks when pnpm is available on PATH.
