import type {
  CustomField,
  DataDoc,
  Field,
  FieldId,
  FilterRule,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFields,
  getDocumentViewById
} from '@dataview/core/document'
import {
  formatFilterRuleValueText,
  getFilterEditorKind,
  getFilterPresetIds,
  isFilterRuleEffective,
  sameFilterRule
} from '@dataview/core/filter'
import {
  getFieldGroupMeta,
  isCustomField
} from '@dataview/core/field'
import { trimToUndefined } from '@shared/core'
import type {
  FieldList,
  FilterConditionProjection,
  FilterRuleProjection,
  SortRuleProjection,
  ViewFilterProjection,
  ViewGroupProjection,
  ViewQuery,
  ViewSearchProjection,
  ViewSortProjection
} from '../../contracts/public'
import { sameFieldList } from './equality'
import {
  reuseIfEqual,
  sameList,
  sameOptionalList,
  sameOptionalProjection
} from './reuse'

const EMPTY_IDS = [] as readonly FieldId[]

const resolveFieldsById = (
  document: DataDoc
): ReadonlyMap<FieldId, Field> => new Map(
  getDocumentFields(document).map(field => [field.id, field] as const)
)

const createFields = (input: {
  fieldIds: readonly FieldId[]
  byId: ReadonlyMap<FieldId, Field>
}): FieldList => {
  const all = input.fieldIds.flatMap(fieldId => {
    const field = input.byId.get(fieldId)
    return field ? [field] : []
  })
  const ids = all.map(field => field.id)
  const custom = all.filter(isCustomField) as readonly CustomField[]
  const indexById = new Map(ids.map((id, index) => [id, index] as const))
  const visibleById = new Map(all.map(field => [field.id, field] as const))

  return {
    ids,
    all,
    custom,
    get: id => visibleById.get(id),
    has: id => indexById.has(id),
    indexOf: id => indexById.get(id),
    at: index => ids[index],
    range: (anchor, focus) => {
      const anchorIndex = indexById.get(anchor)
      const focusIndex = indexById.get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return EMPTY_IDS
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ids.slice(start, end + 1)
    }
  }
}

const createSearchProjection = (
  viewId: ViewId,
  search: ViewSearchProjection['search']
): ViewSearchProjection => ({
  viewId,
  search,
  query: search.query,
  ...(search.fields?.length
    ? { fields: [...search.fields] }
    : {}),
  active: Boolean(trimToUndefined(search.query))
})

const createFilterRuleProjection = (
  field: Field | undefined,
  rule: FilterRule
): FilterRuleProjection => {
  const editorKind = getFilterEditorKind(field, rule)

  return {
    rule,
    fieldId: rule.fieldId,
    field,
    fieldLabel: field?.name ?? 'Deleted field',
    activePresetId: rule.presetId,
    effective: isFilterRuleEffective(field, rule),
    editorKind,
    valueText: formatFilterRuleValueText(field, rule),
    bodyLayout: editorKind === 'none'
      ? 'none'
      : editorKind === 'option-set'
        ? 'flush'
        : 'inset',
    conditions: getFilterPresetIds(field).map(id => ({
      id,
      selected: id === rule.presetId
    }))
  }
}

const createFilterProjection = (input: {
  viewId: ViewId
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
}): ViewFilterProjection => ({
  viewId: input.viewId,
  mode: input.view.filter.mode,
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
    fieldId: input.sorter.field,
    field,
    fieldLabel: field?.name ?? 'Deleted field'
  }
}

const createSortProjection = (input: {
  viewId: ViewId
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
}): ViewSortProjection => ({
  viewId: input.viewId,
  active: input.view.sort.length > 0,
  rules: input.view.sort.map(sorter => createSortRuleProjection({
    sorter,
    fieldsById: input.fieldsById
  }))
})

const createInactiveGroupProjection = (
  viewId: ViewId
): ViewGroupProjection => ({
  viewId,
  active: false,
  fieldId: '',
  field: undefined,
  fieldLabel: '',
  mode: '',
  bucketSort: undefined,
  bucketInterval: undefined,
  showEmpty: true,
  availableModes: [],
  availableBucketSorts: [],
  supportsInterval: false
})

const createGroupProjection = (input: {
  viewId: ViewId
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
}): ViewGroupProjection => {
  const group = input.view.group
  if (!group) {
    return createInactiveGroupProjection(input.viewId)
  }

  const field = input.fieldsById.get(group.field)
  if (!field) {
    return {
      viewId: input.viewId,
      group,
      active: true,
      fieldId: group.field,
      field: undefined,
      fieldLabel: 'Deleted field',
      mode: group.mode,
      bucketSort: group.bucketSort,
      bucketInterval: group.bucketInterval,
      showEmpty: group.showEmpty !== false,
      availableModes: [],
      availableBucketSorts: [],
      supportsInterval: false
    }
  }

  const meta = getFieldGroupMeta(field, {
    mode: group.mode,
    bucketSort: group.bucketSort,
    ...(group.bucketInterval !== undefined
      ? { bucketInterval: group.bucketInterval }
      : {})
  })

  return {
    viewId: input.viewId,
    group,
    active: true,
    fieldId: field.id,
    field,
    fieldLabel: field.name,
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
  sameFilterRule(left.rule, right.rule)
  && left.fieldId === right.fieldId
  && left.fieldLabel === right.fieldLabel
  && left.activePresetId === right.activePresetId
  && left.effective === right.effective
  && left.editorKind === right.editorKind
  && left.valueText === right.valueText
  && left.bodyLayout === right.bodyLayout
  && sameList(left.conditions, right.conditions, equalFilterCondition)
)

const equalFilterProjection = (
  left: ViewFilterProjection | undefined,
  right: ViewFilterProjection | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.mode === next.mode
  && sameList(current.rules, next.rules, equalFilterRuleProjection)
))

const equalSearchProjection = (
  left: ViewSearchProjection | undefined,
  right: ViewSearchProjection | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.query === next.query
  && current.active === next.active
  && sameOptionalList(current.fields, next.fields, Object.is)
))

const equalSortRuleProjection = (
  left: SortRuleProjection,
  right: SortRuleProjection
) => (
  left.fieldId === right.fieldId
  && left.fieldLabel === right.fieldLabel
  && left.sorter.field === right.sorter.field
  && left.sorter.direction === right.sorter.direction
)

const equalSortProjection = (
  left: ViewSortProjection | undefined,
  right: ViewSortProjection | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.active === next.active
  && sameList(current.rules, next.rules, equalSortRuleProjection)
))

const equalGroupProjection = (
  left: ViewGroupProjection | undefined,
  right: ViewGroupProjection | undefined
) => sameOptionalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.active === next.active
  && current.fieldId === next.fieldId
  && current.fieldLabel === next.fieldLabel
  && current.mode === next.mode
  && current.bucketSort === next.bucketSort
  && current.bucketInterval === next.bucketInterval
  && current.showEmpty === next.showEmpty
  && current.supportsInterval === next.supportsInterval
  && sameList(current.availableModes, next.availableModes, Object.is)
  && sameList(current.availableBucketSorts, next.availableBucketSorts, Object.is)
))

export const publishViewBase = (input: {
  document: DataDoc
  viewId?: ViewId
  previous?: {
    view?: View
    query?: ViewQuery
    fields?: FieldList
  }
}): {
  view?: View
  query?: ViewQuery
  fields?: FieldList
} => {
  const view = input.viewId
    ? getDocumentViewById(input.document, input.viewId)
    : undefined
  if (!view || !input.viewId) {
    return {
      view: undefined,
      query: undefined,
      fields: undefined
    }
  }

  const fieldsById = resolveFieldsById(input.document)
  const nextSearch = createSearchProjection(input.viewId, view.search)
  const nextFilter = createFilterProjection({
    viewId: input.viewId,
    view,
    fieldsById
  })
  const nextSort = createSortProjection({
    viewId: input.viewId,
    view,
    fieldsById
  })
  const nextGroup = createGroupProjection({
    viewId: input.viewId,
    view,
    fieldsById
  })
  const nextFields = createFields({
    fieldIds: view.display.fields,
    byId: fieldsById
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
