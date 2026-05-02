import type {
  Field,
  FieldId,
  GalleryView,
  KanbanView,
  TableOptions,
  TableView,
  ViewType
} from '@dataview/core/types'
import type {
  ViewOptionsByType
} from '@dataview/core/types/state'
import { collection, equal, json, string } from '@shared/core'
import {
  normalizeGalleryOptions
} from '@dataview/core/view/layout'
import {
  normalizeKanbanOptions
} from '@dataview/core/view/layout'
import {
  getViewTypeSpec
} from '@dataview/core/view/model/typeSpec'

export interface NormalizeViewOptionsContext {
  type?: ViewType
  fields?: readonly Field[]
}

export interface TableLayoutPatch {
  widths?: Partial<Record<FieldId, number>>
  showVerticalLines?: boolean
  wrap?: boolean
}

export interface GalleryLayoutPatch {
  card?: Partial<GalleryView['options']['card']>
}

export interface KanbanLayoutPatch {
  card?: Partial<KanbanView['options']['card']>
  fillColumnColor?: boolean
  cardsPerColumn?: KanbanView['options']['cardsPerColumn']
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

export const cloneTableOptions = (
  table: TableOptions
): TableOptions => ({
  widths: {
    ...table.widths
  },
  showVerticalLines: table.showVerticalLines,
  wrap: table.wrap
})

export function cloneViewOptions (
  type: 'table',
  options: TableOptions
): TableOptions
export function cloneViewOptions (
  type: 'gallery',
  options: GalleryView['options']
): GalleryView['options']
export function cloneViewOptions (
  type: 'kanban',
  options: KanbanView['options']
): KanbanView['options']
export function cloneViewOptions (
  type: ViewType,
  options: ViewOptionsByType[ViewType]
): ViewOptionsByType[ViewType] {
  switch (type) {
    case 'table':
      return cloneTableOptions(options as TableOptions)
    case 'gallery':
      return {
        ...options,
        card: {
          ...(options as GalleryView['options']).card
        }
      }
    case 'kanban':
      return {
        ...options,
        card: {
          ...(options as KanbanView['options']).card
        }
      }
  }
}

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

export function sameViewOptions (
  type: 'table',
  left: ViewOptionsByType['table'],
  right: ViewOptionsByType['table']
): boolean
export function sameViewOptions (
  type: 'gallery',
  left: ViewOptionsByType['gallery'],
  right: ViewOptionsByType['gallery']
): boolean
export function sameViewOptions (
  type: 'kanban',
  left: ViewOptionsByType['kanban'],
  right: ViewOptionsByType['kanban']
): boolean
export function sameViewOptions (
  type: keyof ViewOptionsByType,
  left: ViewOptionsByType[keyof ViewOptionsByType],
  right: ViewOptionsByType[keyof ViewOptionsByType]
): boolean {
  switch (type) {
    case 'table':
      return (
        equal.sameShallowRecord(
          (left as ViewOptionsByType['table']).widths,
          (right as ViewOptionsByType['table']).widths
        )
        && (left as ViewOptionsByType['table']).showVerticalLines === (right as ViewOptionsByType['table']).showVerticalLines
        && (left as ViewOptionsByType['table']).wrap === (right as ViewOptionsByType['table']).wrap
      )
    case 'gallery':
      return (
        (left as ViewOptionsByType['gallery']).card.wrap === (right as ViewOptionsByType['gallery']).card.wrap
        && (left as ViewOptionsByType['gallery']).card.size === (right as ViewOptionsByType['gallery']).card.size
        && (left as ViewOptionsByType['gallery']).card.layout === (right as ViewOptionsByType['gallery']).card.layout
      )
    case 'kanban':
      return (
        (left as ViewOptionsByType['kanban']).card.wrap === (right as ViewOptionsByType['kanban']).card.wrap
        && (left as ViewOptionsByType['kanban']).card.size === (right as ViewOptionsByType['kanban']).card.size
        && (left as ViewOptionsByType['kanban']).card.layout === (right as ViewOptionsByType['kanban']).card.layout
        && (left as ViewOptionsByType['kanban']).fillColumnColor === (right as ViewOptionsByType['kanban']).fillColumnColor
        && (left as ViewOptionsByType['kanban']).cardsPerColumn === (right as ViewOptionsByType['kanban']).cardsPerColumn
      )
  }
}

export const createDefaultViewFields = (
  type: ViewType,
  fields: readonly Field[]
): FieldId[] => getViewTypeSpec(type).defaults.fields(fields)

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

export const patchTableLayout = (
  options: TableOptions,
  patch: TableLayoutPatch
): TableOptions => {
  if (
    patch.widths === undefined
    && patch.showVerticalLines === undefined
    && patch.wrap === undefined
  ) {
    return cloneViewOptions('table', options)
  }

  return {
    ...options,
    ...(patch.widths !== undefined
      ? {
          widths: {
            ...options.widths,
            ...patch.widths
          }
        }
      : {}),
    ...(patch.showVerticalLines !== undefined
      ? {
          showVerticalLines: patch.showVerticalLines
        }
      : {}),
    ...(patch.wrap !== undefined
      ? {
          wrap: patch.wrap
        }
      : {})
  }
}

export const patchGalleryLayout = (
  options: GalleryView['options'],
  patch: GalleryLayoutPatch
): GalleryView['options'] => {
  if (patch.card === undefined) {
    return cloneViewOptions('gallery', options)
  }

  return {
    ...options,
    card: {
      ...options.card,
      ...patch.card
    }
  }
}

export const patchKanbanLayout = (
  options: KanbanView['options'],
  patch: KanbanLayoutPatch
): KanbanView['options'] => {
  if (
    patch.card === undefined
    && patch.fillColumnColor === undefined
    && patch.cardsPerColumn === undefined
  ) {
    return cloneViewOptions('kanban', options)
  }

  return {
    ...options,
    ...(patch.card !== undefined
      ? {
          card: {
            ...options.card,
            ...patch.card
          }
        }
      : {}),
    ...(patch.fillColumnColor !== undefined
      ? {
          fillColumnColor: patch.fillColumnColor
        }
      : {}),
    ...(patch.cardsPerColumn !== undefined
      ? {
          cardsPerColumn: patch.cardsPerColumn
        }
      : {})
  }
}
