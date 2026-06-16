import config from "@/config/config.json"

type DemoScenario = "baseline" | "project"

export type DemoConfig = {
  tileId: string
  managementPlanId: string
  scenario: DemoScenario
  simulation: {
    lengthYears: number
    runs: number
  }
  impactControls: Array<{
    id: string
    label: string
    value: number
  }>
  mapLayers: string[]
  startingValues: Array<{
    label: string
    value: string
  }>
}

function asDemoScenario(value: unknown): DemoScenario {
  return value === "baseline" ? "baseline" : "project"
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

const raw = config as Partial<DemoConfig>

export const demoConfig: DemoConfig = {
  tileId: asString(raw.tileId),
  managementPlanId: asString(raw.managementPlanId),
  scenario: asDemoScenario(raw.scenario),
  simulation: {
    lengthYears: asNumber(raw.simulation?.lengthYears, 5),
    runs: asNumber(raw.simulation?.runs, 20),
  },
  impactControls: Array.isArray(raw.impactControls)
    ? raw.impactControls.map((control) => ({
        id: asString(control.id),
        label: asString(control.label, control.id),
        value: Math.max(0, Math.min(5, asNumber(control.value, 1))),
      }))
    : [],
  mapLayers: Array.isArray(raw.mapLayers) ? raw.mapLayers.map((item) => String(item)) : [],
  startingValues: Array.isArray(raw.startingValues)
    ? raw.startingValues.map((item) => ({
        label: asString(item.label),
        value: asString(item.value),
      }))
    : [],
}
