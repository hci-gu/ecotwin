import { createServer } from "node:http"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"

type StoredSimulation = {
  id: string
  createdAt: string
  options: Record<string, unknown>
  files: {
    texturePath?: string
    depthPath?: string
  }
}

type AgentSetSummary = {
  name: string
  kind: "empty" | "single" | "multi" | "error"
  files: string[]
  species?: string[]
  error?: string
}

type SimulationResultBase64 = {
  simulation_id: string
  world_size: number
  species: string[]
  sample_every: number
  include_final: boolean
  dtype: "float32"
  shape: number[]
  steps: number[]
  fitness: number
  episode_length: number
  end_reason?: string
  biomass_b64: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const dataDir = process.env.MOCK_SIM_DATA_DIR
  ? path.resolve(process.env.MOCK_SIM_DATA_DIR)
  : path.join(rootDir, "data")
const mapsDir = path.join(dataDir, "maps")

const host = process.env.HOST ?? "127.0.0.1"
const port = Number.parseInt(process.env.PORT ?? "4000", 10)
const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

const baseSpecies = ["sprat", "herring", "cod"] as const
const mockSimulationMaxSteps = 300

const agentSets: AgentSetSummary[] = [
  {
    name: "mock-default",
    kind: "single",
    files: ["10_$cod_9079.34.npy.npz"],
    species: ["cod"],
  },
  {
    name: "mock-age3",
    kind: "multi",
    files: [
      "12_$sprat__a0_14568.62.npy.npz",
      "12_$sprat__a1_13210.11.npy.npz",
      "12_$sprat__a2_15100.44.npy.npz",
      "12_$herring__a0_12001.50.npy.npz",
      "12_$herring__a1_11888.20.npy.npz",
      "12_$herring__a2_12555.90.npy.npz",
      "12_$cod__a0_9800.25.npy.npz",
      "12_$cod__a1_10010.75.npy.npz",
      "12_$cod__a2_10333.40.npy.npz",
    ],
    species: [
      "sprat__a0",
      "sprat__a1",
      "sprat__a2",
      "herring__a0",
      "herring__a1",
      "herring__a2",
      "cod__a0",
      "cod__a1",
      "cod__a2",
    ],
  },
  {
    name: "mock-empty",
    kind: "empty",
    files: [],
  },
]

const crcTable = new Uint32Array(256)
for (let index = 0; index < 256; index++) {
  let current = index
  for (let bit = 0; bit < 8; bit++) {
    current = (current & 1) === 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1
  }
  crcTable[index] = current >>> 0
}

function json(
  status: number,
  value: unknown,
  extraHeaders?: Record<string, string>
) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
  })
}

function notFound(message: string) {
  return json(404, { error: message })
}

function badRequest(message: string) {
  return json(400, { error: message })
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function parseInteger(
  query: URLSearchParams,
  names: string[],
  fallback: number,
  max?: number
) {
  for (const name of names) {
    const raw = query.get(name)
    if (!raw) continue
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed)) {
      const bounded = Math.max(1, parsed)
      return typeof max === "number" ? Math.min(bounded, max) : bounded
    }
  }
  return fallback
}

function parseBoolean(query: URLSearchParams, names: string[], fallback: boolean) {
  for (const name of names) {
    const raw = query.get(name)?.trim().toLowerCase()
    if (!raw) continue
    if (["1", "true", "yes", "on"].includes(raw)) return true
    if (["0", "false", "no", "off"].includes(raw)) return false
  }
  return fallback
}

function optionInteger(
  options: Record<string, unknown>,
  names: string[],
  fallback: number
) {
  for (const name of names) {
    const raw = options[name]
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw)
    if (typeof raw === "string") {
      const parsed = Number.parseInt(raw, 10)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
}

function optionBoolean(
  options: Record<string, unknown>,
  names: string[],
  fallback: boolean
) {
  for (const name of names) {
    const raw = options[name]
    if (typeof raw === "boolean") return raw
    if (typeof raw !== "string") continue
    const normalized = raw.trim().toLowerCase()
    if (["1", "true", "yes", "on"].includes(normalized)) return true
    if (["0", "false", "no", "off"].includes(normalized)) return false
  }
  return fallback
}

function buildActingSpecies(ageGroups: number) {
  if (ageGroups <= 1) return [...baseSpecies]
  return baseSpecies.flatMap((name) =>
    Array.from({ length: ageGroups }, (_, index) => `${name}__a${index}`)
  )
}

function buildOutputSpecies(ageGroups: number) {
  return ["plankton", ...buildActingSpecies(ageGroups)]
}

function buildSteps(maxSteps: number, sampleEvery: number, includeFinal: boolean) {
  const steps: number[] = []
  for (let step = 0; step <= maxSteps; step += sampleEvery) {
    steps.push(step)
  }
  if (includeFinal && steps.at(-1) !== maxSteps) {
    steps.push(maxSteps)
  }
  if (!includeFinal && steps.length > 1 && steps.at(-1) === maxSteps) {
    steps.pop()
  }
  return steps.length ? steps : [0]
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function gaussian2d(x: number, y: number, centerX: number, centerY: number, spread: number) {
  const dx = x - centerX
  const dy = y - centerY
  return Math.exp(-(dx * dx + dy * dy) / Math.max(0.0001, spread))
}

function habitatMask(x: number, y: number, progress: number) {
  const shelf =
    0.9 -
    Math.abs(y + 0.18 * Math.sin(progress * Math.PI * 2) - 0.12 * Math.cos(x * Math.PI * 2))
  const corridor =
    0.75 -
    Math.abs(x * 0.8 - y * 0.55 + 0.22 * Math.cos(progress * Math.PI * 1.3))
  return clamp01(Math.max(shelf, corridor))
}

function speciesCenter(speciesIndex: number, speciesCount: number, progress: number) {
  const phase = progress * Math.PI * 2 + speciesIndex * 0.8
  const offset = speciesCount <= 1 ? 0 : speciesIndex / (speciesCount - 1) - 0.5
  return {
    x: 0.42 * Math.sin(phase * 0.7) + offset * 0.45,
    y: 0.34 * Math.cos(phase * 0.95) - offset * 0.3,
  }
}

function buildBiomassData(
  steps: number[],
  worldSize: number,
  species: string[],
  maxSteps: number
) {
  const values = new Float32Array(steps.length * worldSize * worldSize * species.length)
  let index = 0

  for (const step of steps) {
    const progress = maxSteps <= 0 ? 0 : step / maxSteps
    for (let y = 0; y < worldSize; y++) {
      const yRatio = worldSize <= 1 ? 0 : y / (worldSize - 1)
      const ny = yRatio * 2 - 1
      for (let x = 0; x < worldSize; x++) {
        const xRatio = worldSize <= 1 ? 0 : x / (worldSize - 1)
        const nx = xRatio * 2 - 1
        const mask = habitatMask(nx, ny, progress)

        for (let speciesIndex = 0; speciesIndex < species.length; speciesIndex++) {
          const center = speciesCenter(speciesIndex, species.length, progress)
          const plume = gaussian2d(nx, ny, center.x, center.y, 0.075 + speciesIndex * 0.008)
          const wake = gaussian2d(
            nx,
            ny,
            center.x - 0.24,
            center.y + 0.14,
            0.16 + speciesIndex * 0.012
          )
          const eddy = gaussian2d(
            nx,
            ny,
            -center.x * 0.45,
            center.y * 0.55,
            0.11 + speciesIndex * 0.01
          )
          const seasonal = 0.72 + 0.28 * Math.sin(progress * Math.PI * 2 + speciesIndex * 0.55)
          const speciesWeight = speciesIndex === 0 ? 1.35 : Math.max(0.4, 1.08 - speciesIndex * 0.07)
          const signal =
            (plume * 1.25 + wake * 0.6 + eddy * 0.35) * seasonal * speciesWeight * mask

          if (signal < 0.12 || mask < 0.08) {
            values[index++] = 0
            continue
          }

          const amplitude = speciesIndex === 0 ? 125 : 78 - speciesIndex * 4.5
          values[index++] = Math.max(0, amplitude * signal)
        }
      }
    }
  }

  return values
}

function simulationResponse(
  simulationId: string,
  query: URLSearchParams,
  stored: StoredSimulation
): SimulationResultBase64 {
  const options = stored.options
  const worldSize = parseInteger(
    query,
    ["worldSize", "world_size"],
    optionInteger(options, ["world_size", "worldSize"], 50),
    50
  )
  const maxSteps = parseInteger(
    query,
    ["maxSteps", "max_steps"],
    optionInteger(options, ["max_steps", "maxSteps"], mockSimulationMaxSteps),
    mockSimulationMaxSteps
  )
  const sampleEvery = parseInteger(
    query,
    ["sampleEvery", "sample_every"],
    optionInteger(options, ["sample_every", "sampleEvery"], 10),
    500
  )
  const includeFinal = parseBoolean(
    query,
    ["includeFinal", "include_final"],
    optionBoolean(options, ["include_final", "includeFinal"], true)
  )
  const ageGroups = Math.max(
    1,
    optionInteger(options, ["age_groups", "ageGroups"], 1)
  )
  const species = buildOutputSpecies(ageGroups)
  const steps = buildSteps(maxSteps, sampleEvery, includeFinal)
  const biomass = buildBiomassData(steps, worldSize, species, maxSteps)

  return {
    simulation_id: simulationId,
    world_size: worldSize,
    species,
    sample_every: sampleEvery,
    include_final: includeFinal,
    dtype: "float32",
    shape: [steps.length, worldSize, worldSize, species.length],
    steps,
    fitness: Number((maxSteps * (8 + ageGroups * 0.75)).toFixed(2)),
    episode_length: maxSteps,
    end_reason: "completed",
    biomass_b64: Buffer.from(biomass.buffer).toString("base64"),
  }
}

function encodeNpyHeader(descr: string, shape: number[]) {
  const shapeValue =
    shape.length === 1 ? `${shape[0]},` : shape.length ? shape.join(", ") : ""
  let dict = `{'descr': '${descr}', 'fortran_order': False, 'shape': (${shapeValue}), }`
  let header = `${dict}\n`
  while ((10 + Buffer.byteLength(header, "latin1")) % 16 !== 0) {
    dict += " "
    header = `${dict}\n`
  }

  const headerBytes = Buffer.from(header, "latin1")
  const prefix = Buffer.alloc(10)
  prefix.write("\x93NUMPY", 0, "binary")
  prefix[6] = 1
  prefix[7] = 0
  prefix.writeUInt16LE(headerBytes.length, 8)

  return Buffer.concat([prefix, headerBytes])
}

function encodeFloat32Array(shape: number[], values: Float32Array) {
  return Buffer.concat([
    encodeNpyHeader("<f4", shape),
    Buffer.from(values.buffer, values.byteOffset, values.byteLength),
  ])
}

function encodeInt32Array(shape: number[], values: Int32Array) {
  return Buffer.concat([
    encodeNpyHeader("<i4", shape),
    Buffer.from(values.buffer, values.byteOffset, values.byteLength),
  ])
}

function encodeUnicodeArray(values: string[]) {
  const maxLength = Math.max(1, ...values.map((value) => value.length))
  const payload = Buffer.alloc(values.length * maxLength * 4)
  let offset = 0

  for (const value of values) {
    for (let index = 0; index < maxLength; index++) {
      payload.writeUInt32LE(value.codePointAt(index) ?? 0, offset)
      offset += 4
    }
  }

  return Buffer.concat([encodeNpyHeader(`<U${maxLength}`, [values.length]), payload])
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipEntries(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name)
    const data = entry.data
    const checksum = crc32(data)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localParts.push(localHeader, nameBuffer, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    centralParts.push(centralHeader, nameBuffer)

    offset += localHeader.length + nameBuffer.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const endRecord = Buffer.alloc(22)
  endRecord.writeUInt32LE(0x06054b50, 0)
  endRecord.writeUInt16LE(0, 4)
  endRecord.writeUInt16LE(0, 6)
  endRecord.writeUInt16LE(entries.length, 8)
  endRecord.writeUInt16LE(entries.length, 10)
  endRecord.writeUInt32LE(centralDirectory.length, 12)
  endRecord.writeUInt32LE(offset, 16)
  endRecord.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, endRecord])
}

function buildNpzResponse(result: SimulationResultBase64, biomass: Float32Array) {
  return zipEntries([
    { name: "biomass.npy", data: encodeFloat32Array(result.shape, biomass) },
    {
      name: "steps.npy",
      data: encodeInt32Array([result.steps.length], Int32Array.from(result.steps)),
    },
    {
      name: "species.npy",
      data: encodeUnicodeArray(result.species),
    },
    {
      name: "world_size.npy",
      data: encodeInt32Array([1], Int32Array.from([result.world_size])),
    },
    {
      name: "sample_every.npy",
      data: encodeInt32Array([1], Int32Array.from([result.sample_every])),
    },
  ])
}

function decodeBase64Float32(value: string) {
  const buffer = Buffer.from(value, "base64")
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
}

async function ensureDirectories() {
  await mkdir(mapsDir, { recursive: true })
}

async function readSimulation(id: string) {
  const metadataPath = path.join(mapsDir, id, "metadata.json")
  const content = await readFile(metadataPath, "utf8")
  return JSON.parse(content) as StoredSimulation
}

async function writeSimulation(metadata: StoredSimulation) {
  const dir = path.join(mapsDir, metadata.id)
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf8"
  )
}

async function parseUpload(request: Request) {
  const formData = await request.formData()
  const texture = formData.get("texture")
  const depth = formData.get("depth")
  const rawOptions = formData.get("options")

  if (!(texture instanceof File)) {
    throw new Error("Missing texture file")
  }
  if (!(depth instanceof File)) {
    throw new Error("Missing depth file")
  }

  const optionsValue =
    typeof rawOptions === "string" && rawOptions.trim()
      ? JSON.parse(rawOptions)
      : {}
  const options = toObject(optionsValue)
  const id = randomUUID()
  const dir = path.join(mapsDir, id)

  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, "map.png"), Buffer.from(await texture.arrayBuffer()))
  await writeFile(path.join(dir, "depth.png"), Buffer.from(await depth.arrayBuffer()))

  const metadata: StoredSimulation = {
    id,
    createdAt: new Date().toISOString(),
    options,
    files: {
      texturePath: path.join(dir, "map.png"),
      depthPath: path.join(dir, "depth.png"),
    },
  }

  await writeSimulation(metadata)
  return metadata
}

async function handleUpload(request: Request) {
  try {
    const metadata = await parseUpload(request)
    return json(200, { id: metadata.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return badRequest(message)
  }
}

async function handleRun(simulationId: string, url: URL) {
  try {
    const metadata = await readSimulation(simulationId)
    const result = simulationResponse(simulationId, url.searchParams, metadata)
    const biomass = decodeBase64Float32(result.biomass_b64)
    const format = (url.searchParams.get("format") ?? "base64").toLowerCase()

    if (format === "npz") {
      return new Response(buildNpzResponse(result, biomass), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
        },
      })
    }

    return json(200, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return notFound(message.includes("ENOENT") ? `Unknown simulation: ${simulationId}` : message)
  }
}

export async function handleMockSimulationRequest(request: Request) {
  const requestUrl = new URL(request.url)

  if (request.method === "GET" && requestUrl.pathname === "/simulate/agents") {
    return json(200, agentSets)
  }

  if (request.method === "POST" && requestUrl.pathname === "/simulate/upload") {
    return handleUpload(request)
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/simulate/")) {
    const simulationId = requestUrl.pathname.slice("/simulate/".length)
    if (!simulationId || simulationId === "upload" || simulationId === "agents") {
      return notFound("Not found")
    }
    return handleRun(simulationId, requestUrl)
  }

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    return json(200, { ok: true })
  }

  return notFound("Not found")
}

export async function createMockSimulationServer() {
  await ensureDirectories()

  return createServer(async (req, res) => {
    const requestInit: RequestInit & { duplex?: "half" } = {
      method: req.method,
      headers: req.headers as HeadersInit,
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : (Readable.toWeb(req) as ReadableStream<Uint8Array>),
      duplex: "half",
    }

    const request = new Request(new URL(req.url ?? "/", `http://${host}:${port}`), requestInit)

    const response = await handleMockSimulationRequest(request)

    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    const body = Buffer.from(await response.arrayBuffer())
    res.end(body)
  })
}

if (isMainModule) {
  const server = await createMockSimulationServer()

  server.listen(port, host, async () => {
    const mapsStats = await stat(mapsDir).catch(() => null)
    console.log(
      `[mock-simulation] listening on http://${host}:${port} (maps dir: ${mapsStats ? mapsDir : "unavailable"})`
    )
  })
}
