import domain from "@/config/ecotwin-domain.json"

export type DomainOption = {
  id: string
  label: string
}

export const marineSpecies = domain.species satisfies DomainOption[]
export const constructionCategories =
  domain.constructionCategories satisfies DomainOption[]
export const areaActivityTypes = domain.areaActivityTypes satisfies DomainOption[]
export const activityTypeOptions = [
  { id: "fishing", label: "Fishing" },
  { id: "construction", label: "Construction" },
  ...areaActivityTypes,
] satisfies DomainOption[]

export function createDefaultSpeciesEffortMultipliers() {
  return Object.fromEntries(marineSpecies.map((species) => [species.id, "1.0"]))
}

export function getSpeciesLabel(id: string) {
  return marineSpecies.find((species) => species.id === id)?.label ?? id
}

export function getConstructionCategoryLabel(id: string) {
  return (
    constructionCategories.find((category) => category.id === id)?.label ?? id
  )
}

export function getActivityTypeLabel(id: string) {
  return activityTypeOptions.find((activityType) => activityType.id === id)?.label ?? id
}

export function isConstantAreaActivityType(id: string) {
  return areaActivityTypes.some((activityType) => activityType.id === id)
}
