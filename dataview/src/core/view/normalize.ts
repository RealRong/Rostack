import type {
  GroupProperty,
  GroupViewOptions,
  GroupViewType,
  PropertyId
} from '../contracts'
import { normalizeGroupGalleryOptions } from './gallery'
import { normalizeGroupKanbanOptions } from './kanban'
import { createDefaultGroupViewOptions } from './options'
import { isJsonObject, toTrimmedString } from './shared'

export interface NormalizeGroupViewOptionsContext {
  type?: GroupViewType
  properties?: readonly GroupProperty[]
}

const normalizePropertyIds = (
  values: unknown,
  validPropertyIds?: ReadonlySet<PropertyId>
) => {
  if (!Array.isArray(values)) {
    return [] as PropertyId[]
  }

  const next: PropertyId[] = []
  const seen = new Set<PropertyId>()
  values.forEach(value => {
    const propertyId = toTrimmedString(value) as PropertyId | undefined
    if (!propertyId || seen.has(propertyId)) {
      return
    }
    if (validPropertyIds && !validPropertyIds.has(propertyId)) {
      return
    }
    seen.add(propertyId)
    next.push(propertyId)
  })
  return next
}

const normalizeWidths = (
  value: unknown,
  validPropertyIds?: ReadonlySet<PropertyId>
): GroupViewOptions['table']['widths'] => {
  if (!isJsonObject(value)) {
    return {}
  }

  const next: Partial<Record<PropertyId, number>> = {}
  Object.entries(value).forEach(([key, width]) => {
    const propertyId = toTrimmedString(key) as PropertyId | undefined
    if (!propertyId) {
      return
    }
    if (validPropertyIds && !validPropertyIds.has(propertyId)) {
      return
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      return
    }

    next[propertyId] = width
  })

  return next
}

export const normalizeGroupViewOptions = (
  options: unknown,
  context: NormalizeGroupViewOptionsContext = {}
): GroupViewOptions => {
  const root = isJsonObject(options) ? options : undefined
  const defaultOptions = createDefaultGroupViewOptions(context.type ?? 'table', context.properties ?? [])
  const validPropertyIds = context.properties?.length
    ? new Set(context.properties.map(property => property.id))
    : undefined
  const display = isJsonObject(root?.display) ? root.display : undefined
  const table = isJsonObject(root?.table) ? root.table : undefined

  return {
    display: {
      propertyIds: Array.isArray(display?.propertyIds)
        ? normalizePropertyIds(display.propertyIds, validPropertyIds)
        : defaultOptions.display.propertyIds
    },
    table: {
      widths: normalizeWidths(table?.widths, validPropertyIds)
    },
    gallery: normalizeGroupGalleryOptions(root?.gallery),
    kanban: normalizeGroupKanbanOptions(root?.kanban)
  }
}
