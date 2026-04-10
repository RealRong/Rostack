import type {
  DataDoc,
  Field,
  FieldId,
  FilterRule,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentFields,
  getDocumentViewById
} from '@dataview/core/document'
import type {
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
import type { ViewGroupProjection } from '@dataview/core/group'
import { getFieldGroupMeta } from '@dataview/core/field'
import type { ViewSearchProjection } from '@dataview/core/search'
import type {
  SortRuleProjection,
  ViewSortProjection
} from '@dataview/core/sort'
import type {
  ActiveView
} from '../types'
import type {
  FieldList
} from './types'

const emptyIds = [] as readonly FieldId[]

export const resolveActiveView = (
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

export const resolveFieldsById = (
  document: DataDoc
): ReadonlyMap<FieldId, Field> => new Map(
  getDocumentFields(document).map(field => [field.id, field] as const)
)

export const createFields = (input: {
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

export const createSearchProjection = (
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

export const createFilterProjection = (input: {
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

export const createSortProjection = (input: {
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

export const createGroupProjection = (input: {
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

export const buildPublishedViewState = (input: {
  document: DataDoc
  viewId?: ViewId
}): {
  view?: ActiveView
  search?: ViewSearchProjection
  filter?: ViewFilterProjection
  sort?: ViewSortProjection
  group?: ViewGroupProjection
  fields?: FieldList
} => {
  const view = input.viewId
    ? getDocumentViewById(input.document, input.viewId)
    : undefined
  if (!view || !input.viewId) {
    return {}
  }

  const fieldsById = resolveFieldsById(input.document)

  return {
    view: resolveActiveView(input.document, input.viewId),
    search: createSearchProjection(input.viewId, view.search),
    filter: createFilterProjection({
      viewId: input.viewId,
      view,
      fieldsById
    }),
    sort: createSortProjection({
      viewId: input.viewId,
      view,
      fieldsById
    }),
    group: createGroupProjection({
      viewId: input.viewId,
      view,
      fieldsById
    }),
    fields: createFields({
      fieldIds: view.display.fields,
      byId: fieldsById
    })
  }
}

export {
  sameFilterRule
}
