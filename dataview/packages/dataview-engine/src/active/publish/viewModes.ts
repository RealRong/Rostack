import type {
  CalculationMetric,
  CardLayout,
  CardSize,
  Field,
  FieldId,
  KanbanCardsPerColumn,
  View
} from '@dataview/core/contracts'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  FieldList
} from '@dataview/engine/contracts'
import {
  sameOptionalProjection
} from '@dataview/engine/active/publish/reuse'
import { equal } from '@shared/core'

const EMPTY_TABLE_CALC = new Map<FieldId, CalculationMetric | undefined>()
const DEFAULT_CARD_LAYOUT = 'vertical' as CardLayout
const DEFAULT_CARD_SIZE = 'medium' as CardSize
const DEFAULT_KANBAN_CARDS_PER_COLUMN = 0 as KanbanCardsPerColumn

export const createTableProjection = (input: {
  view: View
  fields: Pick<FieldList, 'ids'>
}): ActiveViewTable => ({
  wrap: input.view.type === 'table'
    ? input.view.options.table.wrap
    : false,
  showVerticalLines: input.view.type === 'table'
    ? input.view.options.table.showVerticalLines
    : false,
  calc: input.view.type === 'table'
    ? new Map(
        input.fields.ids.map(fieldId => [
          fieldId,
          input.view.calc[fieldId] ?? undefined
        ] as const)
      )
    : EMPTY_TABLE_CALC
})

export const createGalleryProjection = (input: {
  view: View
  query: Pick<ActiveViewQuery, 'group' | 'sort'>
}): ActiveViewGallery => {
  if (input.view.type !== 'gallery') {
    return {
      wrap: false,
      size: DEFAULT_CARD_SIZE,
      layout: DEFAULT_CARD_LAYOUT,
      canReorder: false,
      groupUsesOptionColors: false
    }
  }

  return {
    wrap: input.view.options.gallery.card.wrap,
    size: input.view.options.gallery.card.size,
    layout: input.view.options.gallery.card.layout,
    canReorder: !input.query.group.active && input.query.sort.rules.length === 0,
    groupUsesOptionColors: fieldSpec.view.groupUsesOptionColors(input.query.group.field)
  }
}

export const createKanbanProjection = (input: {
  view: View
  query: Pick<ActiveViewQuery, 'group' | 'sort'>
}): ActiveViewKanban => {
  if (input.view.type !== 'kanban') {
    return {
      wrap: false,
      size: DEFAULT_CARD_SIZE,
      layout: DEFAULT_CARD_LAYOUT,
      canReorder: false,
      groupUsesOptionColors: false,
      fillColumnColor: false,
      cardsPerColumn: DEFAULT_KANBAN_CARDS_PER_COLUMN
    }
  }

  const groupUsesOptionColors = fieldSpec.view.groupUsesOptionColors(input.query.group.field)

  return {
    wrap: input.view.options.kanban.card.wrap,
    size: input.view.options.kanban.card.size,
    layout: input.view.options.kanban.card.layout,
    canReorder: input.query.group.active && input.query.sort.rules.length === 0,
    groupUsesOptionColors,
    fillColumnColor: groupUsesOptionColors && input.view.options.kanban.fillColumnColor,
    cardsPerColumn: input.view.options.kanban.cardsPerColumn
  }
}

export const sameTableProjection = (
  left: ActiveViewTable | undefined,
  right: ActiveViewTable | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.wrap === next.wrap
  && current.showVerticalLines === next.showVerticalLines
  && equal.sameMap(current.calc, next.calc)
))

export const sameGalleryProjection = (
  left: ActiveViewGallery | undefined,
  right: ActiveViewGallery | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.wrap === next.wrap
  && current.size === next.size
  && current.layout === next.layout
  && current.canReorder === next.canReorder
  && current.groupUsesOptionColors === next.groupUsesOptionColors
))

export const sameKanbanProjection = (
  left: ActiveViewKanban | undefined,
  right: ActiveViewKanban | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.wrap === next.wrap
  && current.size === next.size
  && current.layout === next.layout
  && current.canReorder === next.canReorder
  && current.groupUsesOptionColors === next.groupUsesOptionColors
  && current.fillColumnColor === next.fillColumnColor
  && current.cardsPerColumn === next.cardsPerColumn
))
