import type {
  Field,
  FieldId,
  ViewOptions,
  ViewType
} from '@dataview/core/contracts'
import { collection, json, string } from '@shared/core'
import { normalizeGalleryOptions } from '@dataview/core/view/gallery'
import { normalizeKanbanOptions } from '@dataview/core/view/kanban'
import { createDefaultViewOptions } from '@dataview/core/view/options'

export interface NormalizeViewOptionsContext {
  type?: ViewType
  fields?: readonly Field[]
}

const normalizeWidths = (
  value: unknown,
  validFieldIds?: ReadonlySet<FieldId>
): ViewOptions['table']['widths'] => {
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

export const normalizeViewOptions = (
  options: unknown,
  context: NormalizeViewOptionsContext = {}
): ViewOptions => {
  const root = json.isJsonObject(options) ? options : undefined
  const defaultOptions = createDefaultViewOptions(context.type ?? 'table', context.fields ?? [])
  const validFieldIds = collection.presentSet(
    context.fields?.map(field => field.id)
  )
  const table = json.isJsonObject(root?.table) ? root.table : undefined

  return {
    table: {
      widths: normalizeWidths(table?.widths, validFieldIds),
      showVerticalLines: normalizeShowVerticalLines(table?.showVerticalLines),
      wrap: normalizeWrap(table?.wrap)
    },
    gallery: normalizeGalleryOptions(root?.gallery),
    kanban: normalizeKanbanOptions(root?.kanban)
  }
}
