import type {
  Field,
  FieldId,
  GalleryView,
  KanbanView,
  TableView,
  ViewDisplay,
  TableOptions,
  ViewType
} from '@dataview/core/contracts'
import type {
  ViewOptionsByType
} from '@dataview/core/contracts/viewOptions'

export const cloneTableOptions = (
  table: TableOptions
): TableOptions => ({
  widths: {
    ...table.widths
  },
  showVerticalLines: table.showVerticalLines,
  wrap: table.wrap
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

export function createDefaultViewOptions (
  type: 'table',
  fields: readonly Field[]
): TableOptions
export function createDefaultViewOptions (
  type: 'gallery',
  fields: readonly Field[]
): GalleryView['options']
export function createDefaultViewOptions (
  type: 'kanban',
  fields: readonly Field[]
): KanbanView['options']
export function createDefaultViewOptions (
  type: ViewType,
  _fields: readonly Field[]
): ViewOptionsByType[ViewType] {
  switch (type) {
    case 'table':
      return {
        widths: {},
        showVerticalLines: true,
        wrap: false
      }
    case 'gallery':
      return {
        card: {
          wrap: false,
          size: 'md',
          layout: 'stacked'
        }
      }
    case 'kanban':
      return {
        card: {
          wrap: false,
          size: 'md',
          layout: 'compact'
        },
        fillColumnColor: true,
        cardsPerColumn: 25
      }
  }
}

export const pruneFieldFromViewOptions = (
  view: TableView,
  fieldId: FieldId
): TableOptions => {
  const hasWidth = Object.prototype.hasOwnProperty.call(view.options.widths, fieldId)

  if (!hasWidth) {
    return view.options
  }

  const widths = {
    ...view.options.widths
  }
  delete widths[fieldId]

  return {
    ...view.options,
    widths
  }
}
