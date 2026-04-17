import type {
  FieldId,
  View,
  ViewOptions
} from '@dataview/core/contracts'

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
    showVerticalLines: options.table.showVerticalLines,
    wrap: options.table.wrap
  },
  gallery: {
    card: {
      wrap: options.gallery.card.wrap,
      size: options.gallery.card.size,
      layout: options.gallery.card.layout
    }
  },
  kanban: {
    card: {
      wrap: options.kanban.card.wrap,
      size: options.kanban.card.size,
      layout: options.kanban.card.layout
    },
    fillColumnColor: options.kanban.fillColumnColor,
    cardsPerColumn: options.kanban.cardsPerColumn
  }
})

export const resolveDisplayInsertBeforeFieldId = (
  fieldIds: readonly FieldId[],
  anchorFieldId: FieldId,
  side: 'left' | 'right'
): FieldId | null => {
  const anchorIndex = fieldIds.findIndex(fieldId => fieldId === anchorFieldId)
  if (anchorIndex === -1) {
    return null
  }

  return side === 'left'
    ? anchorFieldId
    : fieldIds[anchorIndex + 1] ?? null
}
