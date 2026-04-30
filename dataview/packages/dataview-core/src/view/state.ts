import type {
  CalculationMetric,
  FieldId,
  GalleryView,
  KanbanView,
  RecordId,
  TableOptions,
  TableView,
  ViewCalc,
  ViewDisplay
} from '@dataview/core/types'
import type {
  ViewOptionsByType
} from '@dataview/core/types/state'
import {
  collection,
  equal,
  order
} from '@shared/core'
import {
  applyRecordOrder,
  spliceRecordIds
} from '@dataview/core/view/order'
import {
  cloneViewOptions
} from '@dataview/core/view/shared'

export const cloneDisplay = (
  display: ViewDisplay
): ViewDisplay => ({
  fields: [...display.fields]
})

export const sameDisplay = (
  left: ViewDisplay,
  right: ViewDisplay
): boolean => equal.sameOrder(left.fields, right.fields)

export const replaceDisplayFields = (
  fieldIds: readonly FieldId[]
): ViewDisplay => ({
  fields: collection.unique(fieldIds)
})

export const normalizeViewDisplay = (
  display: unknown
): ViewDisplay => {
  const source = typeof display === 'object' && display !== null
    ? display as {
        fields?: unknown
      }
    : undefined

  return replaceDisplayFields(
    Array.isArray(source?.fields)
      ? source.fields.filter((fieldId): fieldId is FieldId => typeof fieldId === 'string')
      : []
  )
}

export const moveDisplayFields = (
  display: ViewDisplay,
  fieldIds: readonly FieldId[],
  beforeFieldId?: FieldId | null
): ViewDisplay => {
  const nextFieldIds = collection.unique(fieldIds)
  if (!nextFieldIds.length) {
    return cloneDisplay(display)
  }

  return {
    fields: order.splice(display.fields, nextFieldIds, {
      before: beforeFieldId ?? undefined
    })
  }
}

export const showDisplayField = (
  display: ViewDisplay,
  fieldId: FieldId,
  beforeFieldId?: FieldId | null
): ViewDisplay => {
  return {
    fields: order.moveItem(display.fields, fieldId, {
      before: beforeFieldId ?? undefined
    })
  }
}

export const hideDisplayField = (
  display: ViewDisplay,
  fieldId: FieldId
): ViewDisplay => ({
  fields: display.fields.filter(currentFieldId => currentFieldId !== fieldId)
})

export const clearDisplayFields = (): ViewDisplay => ({
  fields: []
})

export const setViewCalcMetric = (
  calc: ViewCalc,
  fieldId: FieldId,
  metric: CalculationMetric | null
): ViewCalc => {
  const nextCalc = {
    ...calc
  }

  if (metric === null) {
    delete nextCalc[fieldId]
  } else {
    nextCalc[fieldId] = metric
  }

  return nextCalc
}

export const cloneViewCalc = (
  calc: ViewCalc
): ViewCalc => ({
  ...calc
})

export const sameViewCalc = (
  left: ViewCalc,
  right: ViewCalc
): boolean => equal.sameShallowRecord(left, right)

export const clearViewOrders = (): RecordId[] => []

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
