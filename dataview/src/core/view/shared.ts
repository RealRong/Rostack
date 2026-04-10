import type { View, ViewOptions } from '../contracts'

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

export const cloneViewOptions = (
  options: ViewOptions
): ViewOptions => ({
  table: {
    widths: {
      ...options.table.widths
    },
    showVerticalLines: options.table.showVerticalLines
  },
  gallery: {
    showFieldLabels: options.gallery.showFieldLabels,
    cardSize: options.gallery.cardSize
  },
  kanban: {
    newRecordPosition: options.kanban.newRecordPosition,
    fillColumnColor: options.kanban.fillColumnColor,
    cardsPerColumn: options.kanban.cardsPerColumn
  }
})
