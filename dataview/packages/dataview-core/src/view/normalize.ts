import type {
  Field,
  FieldId,
  ViewOptions,
  ViewType
} from '#core/contracts/index'
import { normalizeGalleryOptions } from '#core/view/gallery'
import { normalizeKanbanOptions } from '#core/view/kanban'
import { createDefaultViewOptions } from '#core/view/options'
import { isJsonObject, toTrimmedString } from '#core/view/shared'

export interface NormalizeViewOptionsContext {
  type?: ViewType
  fields?: readonly Field[]
}

const normalizeWidths = (
  value: unknown,
  validFieldIds?: ReadonlySet<FieldId>
): ViewOptions['table']['widths'] => {
  if (!isJsonObject(value)) {
    return {}
  }

  const next: Partial<Record<FieldId, number>> = {}
  Object.entries(value).forEach(([key, width]) => {
    const fieldId = toTrimmedString(key) as FieldId | undefined
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

export const normalizeViewOptions = (
  options: unknown,
  context: NormalizeViewOptionsContext = {}
): ViewOptions => {
  const root = isJsonObject(options) ? options : undefined
  const defaultOptions = createDefaultViewOptions(context.type ?? 'table', context.fields ?? [])
  const validFieldIds = context.fields?.length
    ? new Set(context.fields.map(field => field.id))
    : undefined
  const table = isJsonObject(root?.table) ? root.table : undefined

  return {
    table: {
      widths: normalizeWidths(table?.widths, validFieldIds),
      showVerticalLines: normalizeShowVerticalLines(table?.showVerticalLines)
    },
    gallery: normalizeGalleryOptions(root?.gallery),
    kanban: normalizeKanbanOptions(root?.kanban)
  }
}
