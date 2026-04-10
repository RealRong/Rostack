import type {
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
import type {
  FilterConditionProjection,
  FilterRuleProjection,
  ViewFilterProjection
} from '@dataview/core/filter'
import {
  formatFilterRuleValueText,
  getFilterEditorKind,
  getFilterPresetIds,
  isFilterRuleEffective,
  sameFilterRule
} from '@dataview/core/filter'
import {
  getFieldGroupMeta
} from '@dataview/core/field'
import type {
  ViewGroupProjection
} from '@dataview/core/group'
import type {
  ViewSearchProjection
} from '@dataview/core/search'
import type {
  SortRuleProjection,
  ViewSortProjection
} from '@dataview/core/sort'
import type {
  ActiveView,
  FilterView,
  GroupView,
  SearchView,
  SortView
} from '../../types'
import type {
  FieldList
} from '../types'
import {
  sameFieldList
} from '../runtime/equality'

const emptyIds = [] as readonly FieldId[]

const equalList = <T,>(
  left: readonly T[],
  right: readonly T[],
  equal: (left: T, right: T) => boolean
) => (
  left.length === right.length
  && left.every((value, index) => equal(value, right[index] as T))
)

const equalOptionalList = <T,>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  equal: (left: T, right: T) => boolean
) => {
  if (!left || !right) {
    return left === right
  }

  return equalList(left, right, equal)
}

const equalProjection = <T,>(
  left: T | undefined,
  right: T | undefined,
  equal: (left: T, right: T) => boolean
) => {
  if (!left || !right) {
    return left === right
  }

  return equal(left, right)
}

const reuseProjection = <T,>(
  previous: T | undefined,
  next: T | undefined,
  equal: (left: T, right: T) => boolean
) => {
  if (!previous || !next) {
    return next
  }

  return equal(previous, next)
    ? previous
    : next
}

const resolveActiveView = (
  document: DataDoc,
  activeViewId: ViewId | undefined
): ActiveView | undefined => {
  if (!activeViewId) {
    return undefined
  }

  const view = getDocumentViewById(document, activeViewId)
  if (!view) {
    return undefined
  }

  return {
    id: view.id,
    name: view.name,
    type: view.type
  }
}

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
    return field
      ? [field]
      : []
  })
  const ids = all.map(field => field.id)
  const indexById = new Map(ids.map((id, index) => [id, index] as const))
  const visibleById = new Map(all.map(field => [field.id, field] as const))

  return {
    ids,
    all,
    get: id => visibleById.get(id),
    has: id => indexById.has(id),
    indexOf: id => indexById.get(id),
    at: index => ids[index],
    range: (anchor, focus) => {
      const anchorIndex = indexById.get(anchor)
      const focusIndex = indexById.get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return emptyIds
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ids.slice(start, end + 1)
    }
  }
}

const createSearchProjection = (
  viewId: string,
  search: ViewSearchProjection['search']
): ViewSearchProjection => ({
  viewId,
  search,
  query: search.query,
  ...(search.fields?.length
    ? { fields: [...search.fields] }
    : {}),
  active: Boolean(search.query.trim())
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
  viewId: string
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
  viewId: string
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
  viewId: string
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
  viewId: string
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

const equalActiveView = (
  left: ActiveView | undefined,
  right: ActiveView | undefined
) => equalProjection(left, right, (current, next) => (
  current.id === next.id
  && current.name === next.name
  && current.type === next.type
))

const equalFilterCondition = (
  left: FilterConditionProjection,
  right: FilterConditionProjection
) => (
  left.id === right.id
  && left.selected === right.selected
)

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
  && equalList(left.conditions, right.conditions, equalFilterCondition)
)

const equalFilterProjection = (
  left: FilterView | undefined,
  right: FilterView | undefined
) => equalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.mode === next.mode
  && equalList(current.rules, next.rules, equalFilterRuleProjection)
))

const equalSearchProjection = (
  left: SearchView | undefined,
  right: SearchView | undefined
) => equalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.query === next.query
  && current.active === next.active
  && equalOptionalList(current.fields, next.fields, Object.is)
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
  left: SortView | undefined,
  right: SortView | undefined
) => equalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.active === next.active
  && equalList(current.rules, next.rules, equalSortRuleProjection)
))

const equalGroupProjection = (
  left: GroupView | undefined,
  right: GroupView | undefined
) => equalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.active === next.active
  && current.fieldId === next.fieldId
  && current.fieldLabel === next.fieldLabel
  && current.mode === next.mode
  && current.bucketSort === next.bucketSort
  && current.bucketInterval === next.bucketInterval
  && current.showEmpty === next.showEmpty
  && current.supportsInterval === next.supportsInterval
  && equalList(current.availableModes, next.availableModes, Object.is)
  && equalList(current.availableBucketSorts, next.availableBucketSorts, Object.is)
))

export const publishViewState = (input: {
  document: DataDoc
  viewId?: ViewId
  previous: {
    view?: ActiveView
    filter?: FilterView
    group?: GroupView
    search?: SearchView
    sort?: SortView
    fields?: FieldList
  }
}): {
  view?: ActiveView
  filter?: FilterView
  group?: GroupView
  search?: SearchView
  sort?: SortView
  fields?: FieldList
} => {
  const view = input.viewId
    ? getDocumentViewById(input.document, input.viewId)
    : undefined
  if (!view || !input.viewId) {
    return {
      view: undefined,
      filter: undefined,
      group: undefined,
      search: undefined,
      sort: undefined,
      fields: undefined
    }
  }

  const fieldsById = resolveFieldsById(input.document)
  const nextView = resolveActiveView(input.document, input.viewId)
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
    view: reuseProjection(input.previous.view, nextView, equalActiveView),
    filter: reuseProjection(input.previous.filter, nextFilter, equalFilterProjection),
    group: reuseProjection(input.previous.group, nextGroup, equalGroupProjection),
    search: reuseProjection(input.previous.search, nextSearch, equalSearchProjection),
    sort: reuseProjection(input.previous.sort, nextSort, equalSortProjection),
    fields: reuseProjection(input.previous.fields, nextFields, sameFieldList)
  }
}
