# ECOTWIN Cleanup TODOs

Source: `report.html`

Goal: remove unfinished/demo UI and finish the cohesive workflow:

1. Create and view tiles.
2. Create management plans for tiles.
3. Run simulations based on those management plans.
4. View simulation results and export a PDF report.

## Phase 1: Remove Visible Placeholder UI

- [x] Delete `src/components/component-example.tsx`.
- [x] Delete `src/components/example.tsx`.
- [x] Remove the unused imports that only supported those demo components, if any remain after deletion.
- [x] Remove the placeholder second tab labeled `(tab item)` from `src/components/tile-list.tsx`.
- [x] Remove the disabled `Video` display mode button from `src/pages/tile-page.tsx`.
- [x] Rename the `Graph` display mode in `src/pages/tile-page.tsx` to match what it actually renders, for example `3D hex map`.
- [x] Remove `Import CSV/ggist` from the management plan detail toolbar in `src/pages/management-plans-page.tsx`.
- [x] Remove `Import CSV/agist` from the management plans index actions in `src/pages/management-plans-page.tsx`.
- [x] Remove the unimplemented `Graphs`, `Simulation history`, and `Settings` plan detail tabs from `src/pages/management-plans-page.tsx`.
- [x] Replace the `Label Text` field label with `Description` or a final domain-specific field label.
- [x] Replace all fake date fallbacks of `2025-12-12` with either `Unknown date` or a hidden/missing state.

## Phase 2: Repo And Code Cleanup

- [x] Replace the template `README.md` with ECOTWIN-specific setup and workflow documentation.
- [x] Replace the Vite favicon reference in `index.html`.
- [x] Delete `public/vite.svg` if the new favicon does not use it.
- [x] Delete `src/assets/react.svg`.
- [x] Replace `.github/copilot-instructions.md`; it currently describes a different project.
- [x] Decide whether `services/mock-simulation/data/maps/*` should stay as fixtures.
- [x] If mock maps are generated runtime data, move them out of git and add an ignore rule.
- [x] Update `eslint.config.js` to ignore generated/runtime paths such as `pocketbase/pb_data`.
- [x] Fix unused catch variables in `src/components/map-viewport.tsx`.
- [x] Fix the synchronous state mirroring lint issue in `src/components/simulation-list.tsx`.
- [x] Decide whether to split shadcn variant exports from component files or relax the Fast Refresh lint rule for shadcn UI files.
- [x] Remove or wire unused API helpers in `src/state/ecotwin-api.ts`: `deleteManagementPlan`, `deleteSimulation`, `simulateUpload`, `fetchSimPath`, `updateTile`, and timestep helpers.
- [x] Remove or wire unused auth state/actions exposed by `useEcotwinState`.
- [x] Run `./node_modules/.bin/tsc -b --pretty false`.
- [x] Run `./node_modules/.bin/eslint src services --max-warnings=0`.
- [x] Run `go test ./...` from `pocketbase`.

## Phase 3: Computed Tile Details

- [x] Replace the static `Simulation info` block in `src/components/tile-details.tsx`.
- [x] Add real tile area calculation from tile bbox.
- [x] Display `metersPerPixel` when available.
- [x] Display asset readiness for landcover and ocean data using the existing status fields.
- [x] Display number of management plans for the tile.
- [x] Display number of simulations for the tile, derived through `simulation.plan -> managementPlan.tile`.
- [x] Display selected simulation result grid size from `result.shape`.
- [x] Display selected simulation sample interval from `result.sample_every`.
- [x] Display selected simulation step range from `result.steps`.
- [x] Hide any tile detail row that has no real backing data.
- [x] Update `MapPage` and `TilePage` calls to pass the computed detail data.

## Phase 4: Tile Edit And Delete

- [x] Add API helper for updating tile fields that need editing, at minimum `name`.
- [x] Add an edit tile UI from the tile details/actions area.
- [x] Support editing tile name.
- [x] Add optimistic or post-save cache refresh for edited tiles.
- [x] Add tile delete API helper.
- [x] Add delete confirmation UI.
- [x] Show dependent management plans and simulations in the delete confirmation.
- [x] Cascade delete dependencies on tile deletion.
- [x] Implement the selected deletion behavior in PocketBase/API/UI.
- [x] After delete, clear selected/hovered tile state.
- [x] After delete, navigate away from deleted tile routes.
- [x] Verify map markers update after edit/delete.

## Phase 5: Marine Management Plan Model

- [x] Create a global JSON domain config for available species, for example `src/config/ecotwin-domain.json`.
- [x] Define species in that config with stable ids and labels, starting from the simulator-supported species.
- [x] Replace hardcoded functional group options in `src/pages/management-plans-page.tsx` with values from the global species config.
- [x] Remove terrestrial functional groups such as `deer_moose`, `wolf_lynx`, `birds_of_prey`, and `rodents_small_mammals`.
- [x] Replace terrestrial activity types with the first-pass marine activity types: `fishing` and `construction`.
- [x] Update `TaskType` in `src/state/ecotwin-types.ts` to use `fishing` and `construction` for the first-pass UI.
- [x] Update PocketBase `tasks.type` select values to include the final first-pass types; no data backfill is needed for existing prototype records.
- [x] Keep task parameters inside flexible `tasks.data` JSON rather than adding typed PocketBase fields for each parameter.
- [x] For every activity, support target scope as either `wholeTile` or `polygon`.
- [x] Update the activity area step so polygon drawing is required only when target scope is `polygon`.
- [x] Store activity target scope in `tasks.data.targetScope`.
- [x] Store polygon geometry and area summary only when target scope is `polygon`.
- [x] For `wholeTile` activities, derive the affected area from the tile during simulation input normalization.
- [x] Keep task timing as `start` and `end` calendar dates.
- [x] Remove `targetBiomassChangePct` from the activity form and from new task data.
- [x] Keep `cost` and `revenue` fields as report/planning metadata.
- [x] For `fishing`, add a per-species effort multiplier input generated from the global species config.
- [x] For `fishing`, store multipliers in `tasks.data.speciesEffortMultipliers`, keyed by species id.
- [x] For `fishing`, default each species multiplier to `1.0`.
- [x] For `fishing`, validate multipliers as finite numbers greater than or equal to `0`.
- [x] For `construction`, add fields that describe the construction activity in marine terms, such as construction category, intensity, and description.
- [x] For `construction`, store parameters in `tasks.data.construction`.
- [x] For `construction`, validate required category/intensity fields once the exact categories are added to the global config.
- [x] Replace activity placeholders such as `E.g. Spring hunting season` and `E.g. deer/moose population control` with marine examples.
- [x] Update activity area colors in `src/components/map-viewport.tsx` for `fishing` and `construction`.
- [x] Update task timeline card summary rendering for `fishing` multipliers and `construction` parameters.
- [x] Remove `fishingClosure`, `speciesProtection`, `habitatRestoration`, and `monitoringOnly` from the Phase 5 implementation scope.
- [x] Do not add an old-record migration/backfill; old terrestrial prototype records can be discarded or manually deleted.

## Phase 6: Connect Management Plans To Simulations

- [x] Define the normalized simulation input contract for a management plan.
- [x] Include plan id, tile id, activity type, activity dates, activity polygon, affected species, and activity parameters in the contract.
- [x] Decide whether activity polygons are passed as JSON, raster masks, modified images, or extra upload parts.
- [x] Decide whether normalized simulation input is built in the frontend, PocketBase, or the simulation service.
- [x] Prefer building/validating normalized input server-side in PocketBase before calling the upstream runner.
- [x] Add a stored simulation input snapshot to the `simulations` record, for example `inputJson`.
- [x] Add a migration for any new simulation input/status fields.
- [x] Update `createSimulationAtom` so simulation records capture the selected plan and any user-selected run options.
- [x] Update `/simulation/{id}/run` in `pocketbase/main.go` to load plan tasks and normalize them.
- [x] Pass normalized plan data to the upstream simulator as options or upload payload.
- [x] Store the normalized input used for the run before caching results.
- [x] Clear cached result files when rerunning with changed input.
- [x] Show validation errors before running when tile assets are missing.
- [x] Show validation errors before running when a plan has unsupported or incomplete activities.
- [x] Show validation errors before running when activity areas are missing or invalid.
- [x] Add a fixture or mock path that proves activity data changes the request payload.
- [x] Update `SIMULATION_API_DOCS.md` and/or `pocketbase/API_DOCS.md` with the final plan-driven simulation contract.

## Phase 7: Simulation Results And Browsing

- [x] Replace the current basic `/simulations` page with a management-plan-style list/detail page.
- [x] Fetch simulations with `expand: plan,plan.tile,plan.tasks`.
- [x] Show simulation record id, runner `simulationId`, tile name, plan name, created date, status, and result availability.
- [x] Derive completed status from cached result fields or add an explicit status field.
- [x] Add loading, empty, error, not-run, running, failed, and completed states.
- [x] Link each simulation row to `/tile/:tileId/simulation/:simulationId`.
- [x] Add a detail view or side panel for the selected simulation if `/simulations/:simulationId` is introduced.
- [x] Keep tile-route result viewing as the canonical result route.
- [x] Add rerun action with confirmation if reruns overwrite cached outputs.
- [x] Make `Results` in `ActionsPane` navigate to the latest completed simulation for the active plan/tile.
- [x] If no completed result exists, make `Results` explain that the simulation must be run first.
- [x] Keep species filtering consistent between chart and map overlay.
- [x] Clarify result display modes: map heatmap, 3D hex map, biomass chart.

## Phase 8: PDF Report Export

- [x] Decide whether PDF generation is client-side or server-side.
- [x] Decide whether PDFs are stored on the simulation record or regenerated on demand.
- [x] Add a report view route, for example `/tile/:tileId/simulation/:simulationId/report`.
- [x] Build the report view from real simulation, tile, plan, task, and result data.
- [x] Include tile name and location metadata.
- [x] Include management plan name and activity summary.
- [x] Include normalized simulation input/options.
- [x] Include result metadata: species, grid size, frame count, sample interval, episode length, and fitness.
- [x] Include biomass chart output.
- [x] Include selected species summaries.
- [x] Include one or more result snapshots if technically feasible.
- [x] Add an export button that generates a PDF from the report view.
- [x] Add loading/error states for PDF generation.
- [x] Add filename convention for exported PDFs.
- [x] Verify exported PDF layout with a real completed simulation.

## Phase 9: Data Model And Permissions Hardening

- [x] Decide whether `tiles.simulations` remains in the schema or simulations are always derived through plan relations.
- [x] Decide whether the `timesteps` collection remains part of the product.
- [x] If `timesteps` is obsolete, remove frontend helpers and plan a schema cleanup.
- [x] Add explicit simulation status fields if cached files are not enough.
- [x] Review PocketBase public create/update/delete rules for tiles.
- [x] Review PocketBase public create/update/delete rules for management plans and tasks.
- [x] Review PocketBase public create/update/delete rules for simulations and exported reports.
- [x] Add auth requirements if this app should not allow anonymous writes.
- [x] Define ownership rules if multiple users will use the same deployment.

## Phase 10: Acceptance Checks

- [x] A user can create a tile from the map.
- [x] A user can view a tile and see only real computed details.
- [x] A user can edit a tile name.
- [x] A user can delete a tile with clear dependency handling.
- [x] A user can create a management plan for a tile.
- [x] A user can add a marine/simulation-compatible activity to the plan.
- [x] A user can draw or edit an activity area.
- [x] A user cannot run a simulation when required tile assets or plan inputs are missing.
- [x] A user can run a simulation from a selected management plan.
- [x] The simulation request includes normalized management-plan activity data.
- [x] A user can view completed simulation results on the tile route.
- [x] A user can browse simulations from `/simulations`.
- [x] A simulation row links back to its tile simulation result route.
- [x] A user can export a completed simulation report as PDF.
- [x] The app contains no visible placeholder/demo controls from this report.
- [x] `./node_modules/.bin/tsc -b --pretty false` passes.
- [x] `./node_modules/.bin/eslint src services --max-warnings=0` passes.
- [x] `go test ./...` from `pocketbase` passes.
