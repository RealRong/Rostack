import type {
  CustomField,
  CustomFieldId,
  View,
  ViewGroup
} from '@dataview/core/types'
import {
  calculation
} from '@dataview/core/view'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  filter as filterApi
} from '@dataview/core/view'
import {
  pruneFieldFromViewOptions
} from '@dataview/core/view/options'
import {
  sort as sortApi
} from '@dataview/core/view'
import {
  entityTable,
  equal
} from '@shared/core'
import {
  readViewDisplayFieldIds,
  replaceViewDisplayFields
} from '@dataview/core/view/display'

const cleanupSearchFields = (
  fieldIds: readonly string[] | undefined,
  fieldId: CustomFieldId
) => {
  if (!fieldIds?.length) {
    return fieldIds ? [...fieldIds] : undefined
  }

  const nextFieldIds = fieldIds.filter(currentFieldId => currentFieldId !== fieldId)
  return nextFieldIds.length
    ? [...nextFieldIds]
    : undefined
}

const withOptionalGroup = <T extends View>(
  view: T,
  group: ViewGroup | undefined
): T => {
  if (view.type === 'kanban') {
    return {
      ...view,
      group: group ?? view.group
    }
  }

  if (!group) {
    const nextView = {
      ...view
    } as T & {
      group?: ViewGroup
    }
    delete nextView.group
    return nextView
  }

  return {
    ...view,
    group
  }
}

const buildRemovedFieldView = (
  view: View,
  fieldId: CustomFieldId
): View => {
  const nextFilterRules = entityTable.normalize.list(
    filterApi.rules.read
      .list(view.filter.rules)
      .filter(rule => rule.fieldId !== fieldId)
  )
  const nextSortRules = entityTable.normalize.list(
    sortApi.rules.read
      .list(view.sort.rules)
      .filter(rule => rule.fieldId !== fieldId)
  )
  const nextSearchFields = cleanupSearchFields(view.search.fields, fieldId)
  const nextCalc = {
    ...view.calc
  }
  delete nextCalc[fieldId]
  const nextDisplayFields = readViewDisplayFieldIds(view.display)
    .filter(currentFieldId => currentFieldId !== fieldId)
  const currentGroup = 'group' in view
    ? view.group
    : undefined
  const nextGroup = currentGroup?.fieldId === fieldId
    ? undefined
    : currentGroup

  const nextShared = {
    ...view,
    filter: {
      ...view.filter,
      rules: nextFilterRules
    },
    sort: {
      rules: nextSortRules
    },
    search: nextSearchFields
      ? {
          ...view.search,
          fields: nextSearchFields
        }
      : {
          query: view.search.query
        },
    calc: nextCalc,
    display: replaceViewDisplayFields(nextDisplayFields)
  }

  if (view.type === 'table') {
    return withOptionalGroup({
      ...nextShared,
      type: 'table',
      options: pruneFieldFromViewOptions(view, fieldId)
    }, nextGroup)
  }

  return withOptionalGroup(nextShared, nextGroup)
}

const normalizeConvertedGroup = (
  group: ViewGroup | undefined,
  field: CustomField
): ViewGroup | undefined => {
  if (!group || group.fieldId !== field.id) {
    return group
  }

  const defaultMeta = fieldApi.group.meta(field)
  if (!defaultMeta.modes.length || !defaultMeta.sorts.length) {
    return undefined
  }

  const modeMeta = fieldApi.group.meta(field, { mode: group.mode })
  return {
    fieldId: field.id,
    mode: modeMeta.mode,
    bucketSort: modeMeta.sort || 'manual',
    ...(modeMeta.bucketInterval !== undefined
      ? { bucketInterval: modeMeta.bucketInterval }
      : {})
  }
}

const buildConvertedFieldView = (
  view: View,
  field: CustomField
): View => {
  const validPresetIds = new Set(filterApi.rule.presetIds(field))
  const nextFilterRules = entityTable.normalize.list(
    filterApi.rules.read
      .list(view.filter.rules)
      .filter(rule => (
        rule.fieldId !== field.id || validPresetIds.has(rule.presetId)
      ))
  )
  const nextCalc = {
    ...view.calc
  }
  const currentMetric = nextCalc[field.id]
  if (currentMetric && !calculation.metric.supports(field, currentMetric)) {
    delete nextCalc[field.id]
  }

  const currentGroup = 'group' in view
    ? view.group
    : undefined

  return withOptionalGroup({
    ...view,
    filter: {
      ...view.filter,
      rules: nextFilterRules
    },
    calc: nextCalc
  }, normalizeConvertedGroup(currentGroup, field))
}

export const repairViewForRemovedField = (
  view: View,
  fieldId: CustomFieldId
): View => {
  const nextView = buildRemovedFieldView(view, fieldId)
  return equal.sameJsonValue(nextView, view)
    ? view
    : nextView
}

export const repairViewForConvertedField = (
  view: View,
  field: CustomField
): View => {
  const nextView = buildConvertedFieldView(view, field)
  return equal.sameJsonValue(nextView, view)
    ? view
    : nextView
}
