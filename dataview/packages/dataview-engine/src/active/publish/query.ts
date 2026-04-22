import type {
  Field,
  FieldId,
  FilterConditionProjection,
  FilterRule,
  View
} from '@dataview/core/contracts'
import {
  filter as filterApi
} from '@dataview/core/filter'
import {
  field as fieldApi
} from '@dataview/core/field'
import type {
  ActiveViewQuery,
  FilterRuleProjection,
  SortRuleProjection,
  ViewFilterProjection,
  ViewGroupProjection,
  ViewSearchProjection,
  ViewSortProjection
} from '@dataview/engine/contracts/view'
import {
  sameList,
  sameOptionalList,
  sameOptionalProjection
} from '@dataview/engine/active/publish/reuse'
import { equal } from '@shared/core'

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

const createGroupProjection = (input: {
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
}): ViewGroupProjection | undefined => {
  const group = input.view.group
  if (!group) {
    return undefined
  }

  const field = input.fieldsById.get(group.field)
  if (!field) {
    return {
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
  current.fieldId === next.fieldId
  && current.field === next.field
  && current.mode === next.mode
  && current.bucketSort === next.bucketSort
  && current.bucketInterval === next.bucketInterval
  && current.showEmpty === next.showEmpty
  && current.supportsInterval === next.supportsInterval
  && sameList(current.availableModes, next.availableModes, Object.is)
  && sameList(current.availableBucketSorts, next.availableBucketSorts, Object.is)
))

export const createQueryProjection = (input: {
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
}): ActiveViewQuery => ({
  search: createSearchProjection(input.view.search),
  filters: createFilterProjection(input),
  group: createGroupProjection(input),
  sort: createSortProjection(input)
})

export const sameQueryProjection = (
  left: ActiveViewQuery | undefined,
  right: ActiveViewQuery | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  equalFilterProjection(current.filters, next.filters)
  && equalGroupProjection(current.group, next.group)
  && equalSearchProjection(current.search, next.search)
  && equalSortProjection(current.sort, next.sort)
))
