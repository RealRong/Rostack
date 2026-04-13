import type {
  FieldId,
  View,
  ViewOptions
} from '#core/contracts/index.ts'

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
