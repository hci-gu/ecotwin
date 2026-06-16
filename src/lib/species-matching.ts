import { marineSpecies } from "@/config/ecotwin-domain"

export function speciesMatchKey(value?: string) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? ""
}

export function speciesAliases(value?: string) {
  const key = speciesMatchKey(value)
  if (!key) return new Set<string>()

  const aliases = new Set([key])
  for (const species of marineSpecies) {
    if (
      speciesMatchKey(species.id) === key ||
      speciesMatchKey(species.label) === key
    ) {
      aliases.add(speciesMatchKey(species.id))
      aliases.add(speciesMatchKey(species.label))
    }
  }
  return aliases
}

export function speciesIndexOf(species: string[], selectedSpecies: string) {
  const selectedAliases = speciesAliases(selectedSpecies)
  if (!selectedAliases.size) return -1
  return species.findIndex((name) => {
    const nameAliases = speciesAliases(name)
    for (const alias of nameAliases) {
      if (selectedAliases.has(alias)) return true
    }
    return false
  })
}
