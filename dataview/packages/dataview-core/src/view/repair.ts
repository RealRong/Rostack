import type {
  CustomField,
  CustomFieldId,
  View
} from '#dataview-core/contracts'
import {
  supportsFieldCalculationMetric
} from '#dataview-core/calculation'
import {
  getFieldGroupMeta
} from '#dataview-core/field'
import {
  getFilterPresetIds
} from '#dataview-core/filter'
import {
  pruneFieldFromViewOptions
} from '#dataview-core/view/options'

const sameJson = (
  left: unknown,
  right: unknown
) => JSON.stringify(left) === JSON.stringify(right)

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
  const nextFilterRules = view.filter.rules.filter(rule => rule.fieldId !== fieldId)
  const nextSorters = view.sort.filter(sorter => sorter.field !== fieldId)
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
    sort: nextSorters,
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

  return sameJson(nextView, view)
    ? view
    : nextView
}

export const repairViewForConvertedField = (
  view: View,
  field: CustomField
): View => {
  const validPresetIds = new Set(getFilterPresetIds(field))
  const nextFilterRules = view.filter.rules.filter(rule => (
    rule.fieldId !== field.id || validPresetIds.has(rule.presetId)
  ))

  let nextGroup = view.group
  if (view.group?.field === field.id) {
    const defaultMeta = getFieldGroupMeta(field)
    if (!defaultMeta.modes.length || !defaultMeta.sorts.length) {
      nextGroup = undefined
    } else {
      const modeMeta = getFieldGroupMeta(field, { mode: view.group.mode })
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
  if (currentMetric && !supportsFieldCalculationMetric(field, currentMetric)) {
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

  return sameJson(nextView, view)
    ? view
    : nextView
}
