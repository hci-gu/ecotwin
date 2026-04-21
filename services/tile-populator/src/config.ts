import { readFileSync } from "node:fs"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

export type TilePopulatorConfig = {
  pocketbaseUrl: string
  pocketbaseEmail: string
  pocketbasePassword: string
  pollIntervalMs: number
  leaseDurationMs: number
  concurrency: number
  geoTiffPath: string
  earthEngineCredentials: Record<string, unknown>
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`)
  }

  return parsed
}

function loadEarthEngineCredentials() {
  const inlineJson = process.env.GOOGLE_EARTH_ENGINE_CREDENTIALS_JSON?.trim()
  if (inlineJson) {
    return JSON.parse(inlineJson) as Record<string, unknown>
  }

  const credentialsPath = requireEnv("GOOGLE_EARTH_ENGINE_CREDENTIALS_PATH")
  const raw = readFileSync(credentialsPath, "utf8")
  return JSON.parse(raw) as Record<string, unknown>
}

export function loadConfig(): TilePopulatorConfig {
  const geoTiffPath =
    process.env.TILE_POPULATOR_GEOTIFF_PATH?.trim() ??
    fileURLToPath(new URL("../data/baltic_sea.tif", import.meta.url))

  if (!existsSync(geoTiffPath)) {
    throw new Error(`GeoTIFF file not found at ${geoTiffPath}`)
  }

  return {
    pocketbaseUrl:
      process.env.TILE_POPULATOR_PB_URL?.trim() ??
      process.env.VITE_POCKETBASE_URL?.trim() ??
      "http://127.0.0.1:8090",
    pocketbaseEmail: requireEnv("TILE_POPULATOR_PB_EMAIL"),
    pocketbasePassword: requireEnv("TILE_POPULATOR_PB_PASSWORD"),
    pollIntervalMs: numberFromEnv("TILE_POPULATOR_POLL_INTERVAL_MS", 5000),
    leaseDurationMs: numberFromEnv("TILE_POPULATOR_LEASE_SECONDS", 300) * 1000,
    concurrency: numberFromEnv("TILE_POPULATOR_CONCURRENCY", 1),
    geoTiffPath,
    earthEngineCredentials: loadEarthEngineCredentials(),
  }
}
