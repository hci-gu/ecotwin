import dotenv from "dotenv"

import { loadConfig } from "./config.ts"
import { runJobRunner } from "./jobRunner.ts"

dotenv.config()

try {
  const config = loadConfig()
  console.log(`[tile-populator] connected to ${config.pocketbaseUrl}`)
  await runJobRunner(config)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[tile-populator] startup failed: ${message}`)
  process.exit(1)
}
