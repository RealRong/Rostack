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
  const nextFilterRules = view.query.filter.rules.filter(rule => rule.field !== fieldId)
  const nextSorters = view.query.sorters.filter(sorter => sorter.field !== fieldId)
  const nextSearchFields = cleanupSearchFields(view.query.search.fields, fieldId)
  const nextGroup = view.query.group?.field === fieldId
    ? undefined
    : view.query.group
  const nextAggregates = view.aggregates.filter(spec => spec.property !== fieldId)

  const nextView: View = {
    ...view,
    query: {
      ...view.query,
      filter: {
        ...view.query.filter,
        rules: nextFilterRules
      },
      search: {
        ...view.query.search,
        ...(nextSearchFields !== undefined
          ? { fields: nextSearchFields }
          : {})
      },
      sorters: nextSorters,
      ...(nextGroup ? { group: nextGroup } : {})
    },
    aggregates: nextAggregates,
    options: nextOptions
  }

  if (nextSearchFields === undefined && Object.prototype.hasOwnProperty.call(nextView.query.search, 'fields')) {
    delete (nextView.query.search as { fields?: readonly string[] }).fields
  }
  if (!nextGroup && Object.prototype.hasOwnProperty.call(nextView.query, 'group')) {
    delete (nextView.query as { group?: View['query']['group'] }).group
  }

  return sameJson(nextView, view) ? view : nextView
}

const cleanupViewForConvertedField = (
  view: View,
  field: CustomField
) => {
  const validFilterOps = new Set(getFieldFilterOps(field))
  const nextFilterRules = view.query.filter.rules.filter(rule => (
    rule.field !== field.id || validFilterOps.has(rule.op)
  ))

  let nextGroup = view.query.group
  if (view.query.group?.field === field.id) {
    const defaultMeta = getFieldGroupMeta(field)
    if (!defaultMeta.modes.length || !defaultMeta.sorts.length) {
      nextGroup = undefined
    } else {
      const modeMeta = getFieldGroupMeta(field, { mode: view.query.group.mode })
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

  const nextView: View = {
    ...view,
    query: {
      ...view.query,
      filter: {
        ...view.query.filter,
        rules: nextFilterRules
      },
      ...(nextGroup ? { group: nextGroup } : {})
    }
  }

  if (!nextGroup && Object.prototype.hasOwnProperty.call(nextView.query, 'group')) {
    delete (nextView.query as { group?: View['query']['group'] }).group
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
      if (view.options.display.fieldIds.includes(field.id)) {
        return []
      }

      return [buildViewPutOperation({
        ...view,
        options: {
          ...cloneViewOptions(view.options),
          display: {
            fieldIds: [...view.options.display.fieldIds, field.id]
          }
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
