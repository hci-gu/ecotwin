import type { SimulationResultBase64 } from "@/state/ecotwin-types"

function decodeBase64ToFloat32(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Float32Array(bytes.buffer)
}

export type SpeciesSummary = {
  name: string
  initialTotal: number
  finalTotal: number
  change: number
}

function resultDimensions(result?: SimulationResultBase64 | null) {
  if (!result || !Array.isArray(result.shape) || result.shape.length !== 4) return null
  const [frameCount, height, width, speciesCount] = result.shape.map((value) => Number(value))
  if (![frameCount, height, width, speciesCount].every((value) => Number.isFinite(value) && value > 0)) {
    return null
  }

  const values = decodeBase64ToFloat32(result.biomass_b64)
  const expected = frameCount * height * width * speciesCount
  if (values.length < expected) return null

  return {
    frameCount,
    height,
    width,
    speciesCount,
    values,
    cellCount: height * width,
  }
}

export function summarizeSpecies(result?: SimulationResultBase64 | null): SpeciesSummary[] {
  const dimensions = resultDimensions(result)
  if (!dimensions || !result) return []
  const { frameCount, speciesCount, values, cellCount } = dimensions

  const labels =
    Array.isArray(result.species) && result.species.length === speciesCount
      ? result.species
      : Array.from({ length: speciesCount }, (_, index) => `Species ${index + 1}`)
  const frameOffset = (frame: number) => frame * cellCount * speciesCount

  return labels.map((name, speciesIndex) => {
    let initialTotal = 0
    let finalTotal = 0
    for (let cell = 0; cell < cellCount; cell += 1) {
      initialTotal += values[frameOffset(0) + cell * speciesCount + speciesIndex] ?? 0
      finalTotal += values[frameOffset(frameCount - 1) + cell * speciesCount + speciesIndex] ?? 0
    }

    return {
      name,
      initialTotal,
      finalTotal,
      change: finalTotal - initialTotal,
    }
  })
}
