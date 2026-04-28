# ECOTWIN Copilot Instructions

This repository contains the ECOTWIN prototype: a React/Vite frontend, a PocketBase backend, and local services for tile population and simulation development.

## Product Flow

1. Create and view map tiles.
2. Create management plans for tiles.
3. Add marine management activities to those plans.
4. Run simulations based on tile assets and management-plan activity data.
5. View simulation results and export PDF reports.

## Development Notes

- Prefer existing app patterns in `src/state`, `src/pages`, and `src/components`.
- Keep prototype/demo UI out of product routes.
- Avoid hardcoded data in visible UI; show real data or an explicit empty state.
- Use PocketBase migrations for schema changes.
- Keep task parameters in flexible JSON unless a field must be queried directly.
- Run TypeScript, ESLint, and Go package checks after meaningful changes.
