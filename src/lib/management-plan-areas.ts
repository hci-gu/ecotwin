import type { Task } from "@/state/ecotwin-types"
import { t } from "@/lib/translations"

export function managementPlanAreaId(taskId: string, areaIndex: number) {
  return `${taskId}:${areaIndex}`
}

export function getManagementPlanAreaColor(taskType: Task["type"]) {
  if (taskType === "fishing") return "#0ea5e9"
  if (taskType === "construction") return "#f97316"
  if (taskType === "windFarm") return "#22c55e"
  if (taskType === "seaLane") return "#2563eb"
  if (taskType === "trawlArea") return "#e11d48"
  return "#64748b"
}

export type ManagementPlanAreaLegendEntry = {
  id: string
  taskId: string
  areaIndex: number
  name: string
  color: string
}

export function managementPlanAreaLegendEntries(tasks: Task[]) {
  return tasks.flatMap<ManagementPlanAreaLegendEntry>((task) => {
    const data = task.data
    const namedTask = task.name || t("common.untitledActivity")
    const areas = Array.isArray(data?.areas) && data.areas.length
      ? data.areas
      : data?.area
        ? [{ area: data.area }]
        : []

    return areas.map((_, areaIndex) => ({
      id: managementPlanAreaId(task.id, areaIndex),
      taskId: task.id,
      areaIndex,
      name: areas.length > 1 ? `${namedTask} ${areaIndex + 1}` : namedTask,
      color: getManagementPlanAreaColor(task.type),
    }))
  })
}
