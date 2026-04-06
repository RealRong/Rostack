import type {
  Field,
  FieldId,
  ViewOptions,
  ViewType
} from '../contracts'
import { normalizeGalleryOptions } from './gallery'
import { normalizeKanbanOptions } from './kanban'
import { createDefaultViewOptions } from './options'
import { isJsonObject, toTrimmedString } from './shared'

export interface NormalizeViewOptionsContext {
  type?: ViewType
  fields?: readonly Field[]
}

const normalizeFieldIds = (
  values: unknown,
  validFieldIds?: ReadonlySet<FieldId>
) => {
  if (!Array.isArray(values)) {
    return [] as FieldId[]
  }

  const next: FieldId[] = []
  const seen = new Set<FieldId>()
  values.forEach(value => {
    const fieldId = toTrimmedString(value) as FieldId | undefined
    if (!fieldId || seen.has(fieldId)) {
      return
    }
    if (validFieldIds && !validFieldIds.has(fieldId)) {
      return
    }
    seen.add(fieldId)
    next.push(fieldId)
  })
  return next
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
  const display = isJsonObject(root?.display) ? root.display : undefined
  const table = isJsonObject(root?.table) ? root.table : undefined

  return {
    display: {
      fieldIds: Array.isArray(display?.fieldIds)
        ? normalizeFieldIds(display.fieldIds, validFieldIds)
        : defaultOptions.display.fieldIds
    },
    table: {
      widths: normalizeWidths(table?.widths, validFieldIds),
      showVerticalLines: normalizeShowVerticalLines(table?.showVerticalLines)
    },
    gallery: normalizeGalleryOptions(root?.gallery),
    kanban: normalizeKanbanOptions(root?.kanban)
  }
}
