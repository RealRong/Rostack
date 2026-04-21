import type {
  CalculationMetric,
  FieldId,
  RecordId,
  ViewCalc,
  ViewDisplay,
  ViewOptions
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import {
  applyRecordOrder,
  reorderRecordBlockIds
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

const uniqueFieldIds = (
  fieldIds: readonly FieldId[]
): FieldId[] => {
  const seen = new Set<FieldId>()
  const next: FieldId[] = []

  fieldIds.forEach(fieldId => {
    if (seen.has(fieldId)) {
      return
    }

    seen.add(fieldId)
    next.push(fieldId)
  })

  return next
}

export const replaceDisplayFields = (
  fieldIds: readonly FieldId[]
): ViewDisplay => ({
  fields: uniqueFieldIds(fieldIds)
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
  const nextFieldIds = uniqueFieldIds(fieldIds)
  if (!nextFieldIds.length) {
    return cloneDisplay(display)
  }

  const movingSet = new Set(nextFieldIds)
  const block = display.fields.filter(fieldId => movingSet.has(fieldId))
  if (!block.length) {
    return cloneDisplay(display)
  }

  if (beforeFieldId && movingSet.has(beforeFieldId)) {
    return cloneDisplay(display)
  }

  const remaining = display.fields.filter(fieldId => !movingSet.has(fieldId))
  const insertIndex = beforeFieldId
    ? remaining.indexOf(beforeFieldId)
    : -1
  const normalizedInsertIndex = insertIndex >= 0
    ? insertIndex
    : remaining.length

  return {
    fields: [
      ...remaining.slice(0, normalizedInsertIndex),
      ...block,
      ...remaining.slice(normalizedInsertIndex)
    ]
  }
}

export const showDisplayField = (
  display: ViewDisplay,
  fieldId: FieldId,
  beforeFieldId?: FieldId | null
): ViewDisplay => {
  const remaining = display.fields.filter(currentFieldId => currentFieldId !== fieldId)
  const insertIndex = beforeFieldId
    ? remaining.indexOf(beforeFieldId)
    : -1
  const normalizedInsertIndex = insertIndex >= 0
    ? insertIndex
    : remaining.length

  return {
    fields: [
      ...remaining.slice(0, normalizedInsertIndex),
      fieldId,
      ...remaining.slice(normalizedInsertIndex)
    ]
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
): boolean => equal.sameJsonValue(
  Object.entries(left).sort(([leftFieldId], [rightFieldId]) => leftFieldId.localeCompare(rightFieldId)),
  Object.entries(right).sort(([leftFieldId], [rightFieldId]) => leftFieldId.localeCompare(rightFieldId))
)

export const reorderViewOrders = (input: {
  allRecordIds: readonly RecordId[]
  currentOrder: readonly RecordId[]
  movingRecordIds: readonly RecordId[]
  beforeRecordId?: RecordId
}): RecordId[] => {
  const movingRecordIds = Array.from(new Set(input.movingRecordIds))
  if (!movingRecordIds.length) {
    return [...input.currentOrder]
  }

  const appliedOrder = applyRecordOrder(input.allRecordIds, input.currentOrder)
  return reorderRecordBlockIds(
    appliedOrder,
    movingRecordIds,
    {
      beforeRecordId: input.beforeRecordId
    }
  )
}

export const clearViewOrders = (): RecordId[] => []

export const sameViewOptions = (
  left: ViewOptions,
  right: ViewOptions
): boolean => (
  equal.sameShallowRecord(left.table.widths, right.table.widths)
  && left.table.showVerticalLines === right.table.showVerticalLines
  && left.table.wrap === right.table.wrap
  && left.gallery.card.wrap === right.gallery.card.wrap
  && left.gallery.card.size === right.gallery.card.size
  && left.gallery.card.layout === right.gallery.card.layout
  && left.kanban.card.wrap === right.kanban.card.wrap
  && left.kanban.card.size === right.kanban.card.size
  && left.kanban.card.layout === right.kanban.card.layout
  && left.kanban.fillColumnColor === right.kanban.fillColumnColor
  && left.kanban.cardsPerColumn === right.kanban.cardsPerColumn
)

export interface TableLayoutPatch {
  widths?: Partial<Record<FieldId, number>>
  showVerticalLines?: boolean
  wrap?: boolean
}

export interface GalleryLayoutPatch {
  card?: Partial<ViewOptions['gallery']['card']>
}

export interface KanbanLayoutPatch {
  card?: Partial<ViewOptions['kanban']['card']>
  fillColumnColor?: boolean
  cardsPerColumn?: ViewOptions['kanban']['cardsPerColumn']
}

export const patchTableLayout = (
  options: ViewOptions,
  patch: TableLayoutPatch
): ViewOptions => {
  if (
    patch.widths === undefined
    && patch.showVerticalLines === undefined
    && patch.wrap === undefined
  ) {
    return cloneViewOptions(options)
  }

  const nextOptions = cloneViewOptions(options)
  nextOptions.table = {
    ...nextOptions.table,
    ...(patch.widths !== undefined
      ? {
          widths: {
            ...nextOptions.table.widths,
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

  return nextOptions
}

export const patchGalleryLayout = (
  options: ViewOptions,
  patch: GalleryLayoutPatch
): ViewOptions => {
  if (patch.card === undefined) {
    return cloneViewOptions(options)
  }

  const nextOptions = cloneViewOptions(options)
  nextOptions.gallery = {
    ...nextOptions.gallery,
    card: {
      ...nextOptions.gallery.card,
      ...patch.card
    }
  }

  return nextOptions
}

export const patchKanbanLayout = (
  options: ViewOptions,
  patch: KanbanLayoutPatch
): ViewOptions => {
  if (
    patch.card === undefined
    && patch.fillColumnColor === undefined
    && patch.cardsPerColumn === undefined
  ) {
    return cloneViewOptions(options)
  }

  const nextOptions = cloneViewOptions(options)
  nextOptions.kanban = {
    ...nextOptions.kanban,
    ...(patch.card !== undefined
      ? {
          card: {
            ...nextOptions.kanban.card,
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

  return nextOptions
}
