import type { BaseOperation } from '@dataview/core/contracts/operations'
import type {
  DataDoc,
  CustomField,
  View,
  CustomFieldId
} from '@dataview/core/contracts/state'
import {
  getDocumentViews
} from '@dataview/core/document'
import {
  getFieldFilterOps,
  getFieldGroupMeta
} from '@dataview/core/field'
import {
  supportsFieldCalculationMetric
} from '@dataview/core/calculation'
import {
  cloneViewOptions,
  pruneFieldFromViewOptions
} from '@dataview/core/view'

const buildViewPutOperation = (view: View): BaseOperation => ({
  type: 'document.view.put',
  view
})

const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

const cleanupSearchFields = (
  fieldIds: readonly string[] | undefined,
  fieldId: CustomFieldId
) => {
  if (!fieldIds?.length) {
    return fieldIds ? [...fieldIds] : undefined
  }

  const nextFieldIds = fieldIds.filter(currentFieldId => currentFieldId !== fieldId)
  return nextFieldIds.length ? [...nextFieldIds] : undefined
}

const cleanupViewForRemovedField = (
  view: View,
  fieldId: CustomFieldId
) => {
  const nextOptions = pruneFieldFromViewOptions(view.options, fieldId)
  const nextFilterRules = view.filter.rules.filter(rule => rule.field !== fieldId)
  const nextSorters = view.sort.filter(sorter => sorter.field !== fieldId)
  const nextSearchFields = cleanupSearchFields(view.search.fields, fieldId)
  const nextGroup = view.group?.field === fieldId
    ? undefined
    : view.group
  const nextCalc = { ...view.calc }
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

  return sameJson(nextView, view) ? view : nextView
}

const cleanupViewForConvertedField = (
  view: View,
  field: CustomField
) => {
  const validFilterOps = new Set(getFieldFilterOps(field))
  const nextFilterRules = view.filter.rules.filter(rule => (
    rule.field !== field.id || validFilterOps.has(rule.op)
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

  const nextCalc = { ...view.calc }
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

  return sameJson(nextView, view) ? view : nextView
}

export const resolvePropertyCreateViewOperations = (
  document: DataDoc,
  field: CustomField
): BaseOperation[] => {
  return getDocumentViews(document)
    .filter(view => view.type === 'table')
    .flatMap(view => {
      if (view.display.fields.includes(field.id)) {
        return []
      }

      return [buildViewPutOperation({
        ...view,
        display: {
          fields: [...view.display.fields, field.id]
        }
      })]
    })
}

export const resolvePropertyRemoveViewOperations = (
  document: DataDoc,
  fieldId: CustomFieldId
): BaseOperation[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = cleanupViewForRemovedField(view, fieldId)
      return nextView === view ? [] : [buildViewPutOperation(nextView)]
    })
)

export const resolvePropertyConvertViewOperations = (
  document: DataDoc,
  field: CustomField
): BaseOperation[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = cleanupViewForConvertedField(view, field)
      return nextView === view ? [] : [buildViewPutOperation(nextView)]
    })
)
