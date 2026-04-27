import type {
  Field,
  FieldId,
  GalleryView,
  KanbanView,
  TableView,
  ViewDisplay,
  TableOptions,
  ViewType
} from '@dataview/core/types'
import type {
  ViewOptionsByType
} from '@dataview/core/types/state'
import {
  getViewTypeSpec
} from '@dataview/core/view/typeSpec'

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
): ViewDisplay => getViewTypeSpec(type).defaults.display(fields)

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
  fields: readonly Field[]
): ViewOptionsByType[ViewType] {
  return getViewTypeSpec(type).defaults.options(fields)
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
