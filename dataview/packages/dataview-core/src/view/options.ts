import type {
  Field,
  FieldId,
  ViewDisplay,
  TableOptions,
  ViewOptions,
  ViewType
} from '@dataview/core/contracts'
import { cloneViewOptions } from '@dataview/core/view/shared'

export const cloneTableOptions = (
  table: TableOptions
): TableOptions => ({
  widths: {
    ...table.widths
  },
  showVerticalLines: table.showVerticalLines,
  wrapCells: table.wrapCells
})

export const createDefaultViewDisplay = (
  type: ViewType,
  fields: readonly Field[]
): ViewDisplay => ({
  fields: !fields.length
    ? []
    : type === 'table'
      ? fields.map(field => field.id)
      : []
})

export const createDefaultViewOptions = (
  _type: ViewType,
  _fields: readonly Field[]
): ViewOptions => ({
  table: {
    widths: {},
    showVerticalLines: true,
    wrapCells: false
  },
  gallery: {
    showFieldLabels: true,
    cardSize: 'md'
  },
  kanban: {
    newRecordPosition: 'end',
    fillColumnColor: true,
    cardsPerColumn: 25
  }
})

export const pruneFieldFromViewOptions = (
  options: ViewOptions,
  fieldId: FieldId
): ViewOptions => {
  const current = cloneViewOptions(options)
  const hasWidth = Object.prototype.hasOwnProperty.call(current.table.widths, fieldId)

  if (!hasWidth) {
    return options
  }

  if (hasWidth) {
    const widths = {
      ...current.table.widths
    }
    delete widths[fieldId]
    current.table = {
      ...current.table,
      widths
    }
  }

  return current
}
