import type {
  CustomField,
  Field,
  FieldId,
  FilterRule,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  filter as filterApi
} from '@dataview/core/filter'
import {
  field as fieldApi
} from '@dataview/core/field'
import { EMPTY_VIEW_GROUP_PROJECTION } from '@dataview/engine/contracts/public'
import type {
  ActiveViewQuery,
  FieldList,
  FilterConditionProjection,
  FilterRuleProjection,
  SortRuleProjection,
  ViewFilterProjection,
  ViewGroupProjection,
  ViewSearchProjection,
  ViewSortProjection
} from '@dataview/engine/contracts/public'
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
import {
  sameJsonValue
} from '@shared/core'
import {
  type DocumentReader
} from '@dataview/engine/document/reader'

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
  && sameJsonValue(left.value, right.value)
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

export const publishViewBase = (input: {
  reader: DocumentReader
  fieldsById: ReadonlyMap<FieldId, Field>
  viewId?: ViewId
  previous?: {
    view?: View
    query?: ActiveViewQuery
    fields?: FieldList
  }
}): {
  view?: View
  query?: ActiveViewQuery
  fields?: FieldList
} => {
  const view = input.viewId
    ? input.reader.views.get(input.viewId)
    : undefined
  if (!view || !input.viewId) {
    return {
      view: undefined,
      query: undefined,
      fields: undefined
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

  return {
    view: input.previous?.view === view
      ? input.previous.view
      : view,
    query: reuseIfEqual(
      input.previous?.query,
      {
        filters: nextFilter,
        group: nextGroup,
        search: nextSearch,
        sort: nextSort
      },
      (current, next) => (
        equalFilterProjection(current.filters, next.filters)
        && equalGroupProjection(current.group, next.group)
        && equalSearchProjection(current.search, next.search)
        && equalSortProjection(current.sort, next.sort)
      )
    ),
    fields: reuseIfEqual(input.previous?.fields, nextFields, sameFieldList)
  }
}
