import type {
  CustomField,
  CustomFieldId,
  View
} from '@dataview/core/contracts'
import {
  calculation
} from '@dataview/core/calculation'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  filter as filterApi
} from '@dataview/core/filter'
import {
  sort as sortApi
} from '@dataview/core/sort'
import {
  pruneFieldFromViewOptions
} from '@dataview/core/view/options'
import {
  entityTable,
  equal
} from '@shared/core'

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

export const repairViewForRemovedField = (
  view: View,
  fieldId: CustomFieldId
): View => {
  const nextOptions = pruneFieldFromViewOptions(view.options, fieldId)
  const nextFilterRules = entityTable.normalize.list(
    filterApi.rules
      .list(view.filter.rules)
      .filter(rule => rule.fieldId !== fieldId)
  )
  const nextSortRules = entityTable.normalize.list(
    sortApi.rules
      .list(view.sort.rules)
      .filter(rule => rule.fieldId !== fieldId)
  )
  const nextSearchFields = cleanupSearchFields(view.search.fields, fieldId)
  const nextGroup = view.group?.field === fieldId
    ? undefined
    : view.group
  const nextCalc = {
    ...view.calc
  }
  const nextDisplayFields = view.display.fields.filter(currentFieldId => currentFieldId !== fieldId)
  delete nextCalc[fieldId]

  const nextView: View = {
    ...view,
    filter: {
      ...view.filter,
      rules: nextFilterRules
    },
    search: {
      ...view.search,
      ...(nextSearchFields !== undefined
        ? { fields: nextSearchFields }
        : {})
    },
    sort: {
      rules: nextSortRules
    },
    ...(nextGroup ? { group: nextGroup } : {}),
    calc: nextCalc,
    display: {
      fields: nextDisplayFields
    },
    options: nextOptions
  }

  if (nextSearchFields === undefined && Object.prototype.hasOwnProperty.call(nextView.search, 'fields')) {
    delete (nextView.search as { fields?: readonly string[] }).fields
  }
  if (!nextGroup && Object.prototype.hasOwnProperty.call(nextView, 'group')) {
    delete (nextView as { group?: View['group'] }).group
  }

  return equal.sameJsonValue(nextView, view)
    ? view
    : nextView
}

export const repairViewForConvertedField = (
  view: View,
  field: CustomField
): View => {
  const validPresetIds = new Set(filterApi.rule.presetIds(field))
  const nextFilterRules = entityTable.normalize.list(
    filterApi.rules
      .list(view.filter.rules)
      .filter(rule => (
        rule.fieldId !== field.id || validPresetIds.has(rule.presetId)
      ))
  )

  let nextGroup = view.group
  if (view.group?.field === field.id) {
    const defaultMeta = fieldApi.group.meta(field)
    if (!defaultMeta.modes.length || !defaultMeta.sorts.length) {
      nextGroup = undefined
    } else {
      const modeMeta = fieldApi.group.meta(field, { mode: view.group.mode })
      nextGroup = {
        field: field.id,
        mode: modeMeta.mode,
        bucketSort: modeMeta.sort || 'manual',
        ...(modeMeta.bucketInterval !== undefined
          ? { bucketInterval: modeMeta.bucketInterval }
          : {})
      }
    }
  }

  const nextCalc = {
    ...view.calc
  }
  const currentMetric = nextCalc[field.id]
  if (currentMetric && !calculation.metric.supports(field, currentMetric)) {
    delete nextCalc[field.id]
  }

  const nextView: View = {
    ...view,
    filter: {
      ...view.filter,
      rules: nextFilterRules
    },
    ...(nextGroup ? { group: nextGroup } : {}),
    calc: nextCalc
  }

  if (!nextGroup && Object.prototype.hasOwnProperty.call(nextView, 'group')) {
    delete (nextView as { group?: View['group'] }).group
  }

  return equal.sameJsonValue(nextView, view)
    ? view
    : nextView
}
