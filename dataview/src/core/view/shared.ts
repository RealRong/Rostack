import type { GroupView, GroupViewOptions } from '../contracts'

export type JsonObject = Record<string, unknown>

export const isJsonObject = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

export const toTrimmedString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length ? normalized : undefined
}

export const cloneGroupViewOptions = (
  options: GroupViewOptions
): GroupViewOptions => ({
  display: {
    propertyIds: [...options.display.propertyIds]
  },
  table: {
    widths: {
      ...options.table.widths
    }
  },
  gallery: {
    showPropertyLabels: options.gallery.showPropertyLabels,
    cardSize: options.gallery.cardSize
  },
  kanban: {
    newRecordPosition: options.kanban.newRecordPosition
  }
})
