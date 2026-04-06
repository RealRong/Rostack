import type {
  Field,
  FieldId,
  TableOptions,
  ViewOptions,
  ViewDisplayOptions,
  ViewType
} from '../contracts'
import { cloneViewOptions } from './shared'

export const cloneViewDisplayOptions = (
  display: ViewDisplayOptions
): ViewDisplayOptions => ({
  fieldIds: [...display.fieldIds]
})

export const cloneTableOptions = (
  table: TableOptions
): TableOptions => ({
  widths: {
    ...table.widths
  },
  showVerticalLines: table.showVerticalLines
})

export const createDefaultViewDisplayOptions = (
  type: ViewType,
  fields: readonly Field[]
): ViewDisplayOptions => ({
  fieldIds: !fields.length
    ? []
    : type === 'table'
      ? fields.map(field => field.id)
      : []
})

export const createDefaultViewOptions = (
  type: ViewType,
  fields: readonly Field[]
): ViewOptions => ({
  display: createDefaultViewDisplayOptions(type, fields),
  table: {
    widths: {},
    showVerticalLines: true
  },
  gallery: {
    showFieldLabels: true,
    cardSize: 'md'
  },
  kanban: {
    newRecordPosition: 'end',
    fillColumnColor: true
  }
})

export const pruneFieldFromViewOptions = (
  options: ViewOptions,
  fieldId: FieldId
): ViewOptions => {
  const current = cloneViewOptions(options)
  const hasDisplay = current.display.fieldIds.some(id => id === fieldId)
  const hasWidth = Object.prototype.hasOwnProperty.call(current.table.widths, fieldId)

  if (!hasDisplay && !hasWidth) {
    return options
  }

  if (hasDisplay) {
    current.display = {
      fieldIds: current.display.fieldIds.filter(id => id !== fieldId)
    }
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
