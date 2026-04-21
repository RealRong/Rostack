import type {
  CalculationMetric,
  CardLayout,
  CardSize,
  CustomField,
  Field,
  FieldId,
  FilterConditionProjection,
  FilterRule,
  KanbanCardsPerColumn,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  filter as filterApi
} from '@dataview/core/filter'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import { EMPTY_VIEW_GROUP_PROJECTION } from '@dataview/engine/contracts'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  FieldList,
  FilterRuleProjection,
  SortRuleProjection,
  ViewFilterProjection,
  ViewGroupProjection,
  ViewSearchProjection,
  ViewSortProjection
} from '@dataview/engine/contracts'
import { sameFieldList } from '@dataview/engine/active/snapshot/equality'
import {
  createOrderedKeyedListCollection
} from '@dataview/engine/active/snapshot/list'
import {
  reuseIfEqual,
  sameList,
  sameOptionalList,
  sameOptionalProjection
} from '@dataview/engine/active/snapshot/reuse'
import { equal } from '@shared/core'
import type {
  DocumentReader
} from '@dataview/engine/document/reader'

const EMPTY_TABLE_CALC = new Map<FieldId, CalculationMetric | undefined>()
const DEFAULT_CARD_LAYOUT = 'vertical' as CardLayout
const DEFAULT_CARD_SIZE = 'medium' as CardSize
const DEFAULT_KANBAN_CARDS_PER_COLUMN = 0 as KanbanCardsPerColumn

const createFields = (input: {
  fieldIds: readonly FieldId[]
  byId: ReadonlyMap<FieldId, Field>
}): FieldList => {
  const all: Field[] = []
  const ids: FieldId[] = []
  const custom: CustomField[] = []
  const visibleById = new Map<FieldId, Field>()

  input.fieldIds.forEach(fieldId => {
    const field = input.byId.get(fieldId)
    if (!field) {
      return
    }

    all.push(field)
    ids.push(field.id)
    visibleById.set(field.id, field)
    if (fieldApi.kind.isCustom(field)) {
      custom.push(field)
    }
  })
  const fields = createOrderedKeyedListCollection({
    ids,
    all,
    get: id => visibleById.get(id)
  })

  return {
    ...fields,
    custom
  }
}

const createSearchProjection = (
  search: View['search']
): ViewSearchProjection => ({
  query: search.query,
  ...(search.fields?.length
    ? { fields: [...search.fields] }
    : {})
})

const createFilterRuleProjection = (
  field: Field | undefined,
  rule: FilterRule
): FilterRuleProjection => {
  const editorKind = filterApi.rule.editorKind(field, rule)

  return {
    rule,
    field,
    fieldMissing: !field,
    activePresetId: rule.presetId,
    effective: filterApi.rule.effective(field, rule),
    editorKind,
    value: filterApi.rule.project(field, rule),
    bodyLayout: editorKind === 'none'
      ? 'none'
      : editorKind === 'option-set'
        ? 'flush'
        : 'inset',
    conditions: filterApi.rule.presetIds(field).map((id: string) => ({
      id,
      selected: id === rule.presetId
    }))
  }
}

const createFilterProjection = (input: {
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
}): ViewFilterProjection => ({
  rules: input.view.filter.rules.map(rule => createFilterRuleProjection(
    rule.fieldId === 'title'
      ? input.fieldsById.get('title')
      : input.fieldsById.get(rule.fieldId),
    rule
  ))
})

const createSortRuleProjection = (input: {
  sorter: SortRuleProjection['sorter']
  fieldsById: ReadonlyMap<string, SortRuleProjection['field']>
}): SortRuleProjection => {
  const field = input.fieldsById.get(input.sorter.field)

  return {
    sorter: input.sorter,
    field
  }
}

const createSortProjection = (input: {
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
}): ViewSortProjection => ({
  rules: input.view.sort.map(sorter => createSortRuleProjection({
    sorter,
    fieldsById: input.fieldsById
  }))
})

const createInactiveGroupProjection = (): ViewGroupProjection => EMPTY_VIEW_GROUP_PROJECTION

const createGroupProjection = (input: {
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
}): ViewGroupProjection => {
  const group = input.view.group
  if (!group) {
    return createInactiveGroupProjection()
  }

  const field = input.fieldsById.get(group.field)
  if (!field) {
    return {
      active: true,
      fieldId: group.field,
      field: undefined,
      mode: group.mode,
      bucketSort: group.bucketSort,
      bucketInterval: group.bucketInterval,
      showEmpty: group.showEmpty !== false,
      availableModes: [],
      availableBucketSorts: [],
      supportsInterval: false
    }
  }

  const meta = fieldApi.group.meta(field, {
    mode: group.mode,
    bucketSort: group.bucketSort,
    ...(group.bucketInterval !== undefined
      ? { bucketInterval: group.bucketInterval }
      : {})
  })

  return {
    active: true,
    fieldId: field.id,
    field,
    mode: meta.mode,
    bucketSort: meta.sort || undefined,
    bucketInterval: meta.bucketInterval,
    showEmpty: meta.showEmpty !== false,
    availableModes: meta.modes,
    availableBucketSorts: meta.sorts,
    supportsInterval: meta.supportsInterval
  }
}

const createTableProjection = (input: {
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

const createGalleryProjection = (input: {
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

const createKanbanProjection = (input: {
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

const equalFilterCondition = (
  left: FilterConditionProjection,
  right: FilterConditionProjection
) => left.id === right.id && left.selected === right.selected

const equalFilterRuleProjection = (
  left: FilterRuleProjection,
  right: FilterRuleProjection
) => (
  filterApi.rule.same(left.rule, right.rule)
  && left.fieldMissing === right.fieldMissing
  && left.activePresetId === right.activePresetId
  && left.effective === right.effective
  && left.editorKind === right.editorKind
  && equal.sameJsonValue(left.value, right.value)
  && left.bodyLayout === right.bodyLayout
  && sameList(left.conditions, right.conditions, equalFilterCondition)
)

const equalFilterProjection = (
  left: ViewFilterProjection | undefined,
  right: ViewFilterProjection | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  sameList(current.rules, next.rules, equalFilterRuleProjection)
))

const equalSearchProjection = (
  left: ViewSearchProjection | undefined,
  right: ViewSearchProjection | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.query === next.query
  && sameOptionalList(current.fields, next.fields, Object.is)
))

const equalSortRuleProjection = (
  left: SortRuleProjection,
  right: SortRuleProjection
) => (
  left.field === right.field
  && left.sorter.field === right.sorter.field
  && left.sorter.direction === right.sorter.direction
)

const equalSortProjection = (
  left: ViewSortProjection | undefined,
  right: ViewSortProjection | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  sameList(current.rules, next.rules, equalSortRuleProjection)
))

const equalGroupProjection = (
  left: ViewGroupProjection | undefined,
  right: ViewGroupProjection | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.active === next.active
  && current.fieldId === next.fieldId
  && current.field === next.field
  && current.mode === next.mode
  && current.bucketSort === next.bucketSort
  && current.bucketInterval === next.bucketInterval
  && current.showEmpty === next.showEmpty
  && current.supportsInterval === next.supportsInterval
  && sameList(current.availableModes, next.availableModes, Object.is)
  && sameList(current.availableBucketSorts, next.availableBucketSorts, Object.is)
))

const equalQueryProjection = (
  left: ActiveViewQuery | undefined,
  right: ActiveViewQuery | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  equalFilterProjection(current.filters, next.filters)
  && equalGroupProjection(current.group, next.group)
  && equalSearchProjection(current.search, next.search)
  && equalSortProjection(current.sort, next.sort)
))

const equalTableProjection = (
  left: ActiveViewTable | undefined,
  right: ActiveViewTable | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.wrap === next.wrap
  && current.showVerticalLines === next.showVerticalLines
  && equal.sameMap(current.calc, next.calc)
))

const equalGalleryProjection = (
  left: ActiveViewGallery | undefined,
  right: ActiveViewGallery | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.wrap === next.wrap
  && current.size === next.size
  && current.layout === next.layout
  && current.canReorder === next.canReorder
  && current.groupUsesOptionColors === next.groupUsesOptionColors
))

const equalKanbanProjection = (
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

export const publishViewBase = (input: {
  reader: DocumentReader
  fieldsById: ReadonlyMap<FieldId, Field>
  viewId?: ViewId
  previous?: {
    view?: View
    query?: ActiveViewQuery
    fields?: FieldList
    table?: ActiveViewTable
    gallery?: ActiveViewGallery
    kanban?: ActiveViewKanban
  }
}): {
  view?: View
  query?: ActiveViewQuery
  fields?: FieldList
  table?: ActiveViewTable
  gallery?: ActiveViewGallery
  kanban?: ActiveViewKanban
} => {
  const view = input.viewId
    ? input.reader.views.get(input.viewId)
    : undefined
  if (!view || !input.viewId) {
    return {
      view: undefined,
      query: undefined,
      fields: undefined,
      table: undefined,
      gallery: undefined,
      kanban: undefined
    }
  }

  const nextSearch = createSearchProjection(view.search)
  const nextFilter = createFilterProjection({
    view,
    fieldsById: input.fieldsById
  })
  const nextSort = createSortProjection({
    view,
    fieldsById: input.fieldsById
  })
  const nextGroup = createGroupProjection({
    view,
    fieldsById: input.fieldsById
  })
  const nextFields = createFields({
    fieldIds: view.display.fields,
    byId: input.fieldsById
  })
  const nextQuery = {
    filters: nextFilter,
    group: nextGroup,
    search: nextSearch,
    sort: nextSort
  } satisfies ActiveViewQuery
  const nextTable = createTableProjection({
    view,
    fields: nextFields
  })
  const nextGallery = createGalleryProjection({
    view,
    query: nextQuery
  })
  const nextKanban = createKanbanProjection({
    view,
    query: nextQuery
  })

  return {
    view: input.previous?.view === view
      ? input.previous.view
      : view,
    query: reuseIfEqual(input.previous?.query, nextQuery, equalQueryProjection),
    fields: reuseIfEqual(input.previous?.fields, nextFields, sameFieldList),
    table: reuseIfEqual(input.previous?.table, nextTable, equalTableProjection),
    gallery: reuseIfEqual(input.previous?.gallery, nextGallery, equalGalleryProjection),
    kanban: reuseIfEqual(input.previous?.kanban, nextKanban, equalKanbanProjection)
  }
}
