export type SpeciesColor = {
  hex: string
  rgb: [number, number, number]
}

const speciesColors: Record<string, SpeciesColor> = {
  phytoplankton: { hex: "#67a976", rgb: [103, 169, 118] },
  zooplankton: { hex: "#d8c66d", rgb: [216, 198, 109] },
  pelagicfish: { hex: "#9f6db5", rgb: [159, 109, 181] },
  codfish: { hex: "#4aa3f0", rgb: [74, 163, 240] },
  porpoises: { hex: "#8586dd", rgb: [133, 134, 221] },
  seabirds: { hex: "#7b78c9", rgb: [123, 120, 201] },
}

const fallbackColors: SpeciesColor[] = [
  { hex: "#14b8a6", rgb: [20, 184, 166] },
  { hex: "#f97316", rgb: [249, 115, 22] },
  { hex: "#84cc16", rgb: [132, 204, 22] },
  { hex: "#64748b", rgb: [100, 116, 139] },
]

export function speciesColorKey(value?: string) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? ""
}

export function getSpeciesColor(value?: string, fallbackIndex = 0) {
  const key = speciesColorKey(value)
  return speciesColors[key] ?? fallbackColors[fallbackIndex % fallbackColors.length]
}
