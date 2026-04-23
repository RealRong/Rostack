import type {
  Field,
  FieldId,
  ViewType
} from '@dataview/core/contracts'
import type {
  TableOptions,
  ViewOptionsByType
} from '@dataview/core/contracts/viewOptions'
import { collection, json, string } from '@shared/core'
import { normalizeGalleryOptions } from '@dataview/core/view/gallery'
import { normalizeKanbanOptions } from '@dataview/core/view/kanban'

export interface NormalizeViewOptionsContext {
  type?: ViewType
  fields?: readonly Field[]
}

const normalizeWidths = (
  value: unknown,
  validFieldIds?: ReadonlySet<FieldId>
): TableOptions['widths'] => {
  if (!json.isJsonObject(value)) {
    return {}
  }

  const next: Partial<Record<FieldId, number>> = {}
  Object.entries(value).forEach(([key, width]) => {
    const fieldId = string.trimToUndefined(key) as FieldId | undefined
    if (!fieldId) {
      return
    }
    if (validFieldIds && !validFieldIds.has(fieldId)) {
      return
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      return
    }

    next[fieldId] = width
  })

  return next
}

const normalizeShowVerticalLines = (value: unknown) => (
  typeof value === 'boolean'
    ? value
    : true
)

const normalizeWrap = (value: unknown) => (
  typeof value === 'boolean'
    ? value
    : false
)

export function normalizeViewOptions (
  options: unknown,
  context: { type: 'table'; fields?: readonly Field[] }
): TableOptions
export function normalizeViewOptions (
  options: unknown,
  context: { type: 'gallery'; fields?: readonly Field[] }
): ViewOptionsByType['gallery']
export function normalizeViewOptions (
  options: unknown,
  context: { type: 'kanban'; fields?: readonly Field[] }
): ViewOptionsByType['kanban']
export function normalizeViewOptions (
  options: unknown,
  context: NormalizeViewOptionsContext = {}
): ViewOptionsByType[ViewType] {
  const root = json.isJsonObject(options) ? options : undefined
  const validFieldIds = collection.presentSet(
    context.fields?.map(field => field.id)
  )
  const type = context.type ?? 'table'

  switch (type) {
    case 'table': {
      const table = json.isJsonObject(root) ? root : undefined
      return {
        widths: normalizeWidths(table?.widths, validFieldIds),
        showVerticalLines: normalizeShowVerticalLines(table?.showVerticalLines),
        wrap: normalizeWrap(table?.wrap)
      }
    }
    case 'gallery':
      return normalizeGalleryOptions(root)
    case 'kanban':
      return normalizeKanbanOptions(root)
  }
}
