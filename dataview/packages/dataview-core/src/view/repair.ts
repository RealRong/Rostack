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
  sort as sortApi
} from '@dataview/core/view'
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
  const currentGroup = 'group' in view
    ? view.group
    : undefined
  const nextGroup = currentGroup?.fieldId === fieldId
    ? undefined
    : currentGroup
  const nextCalc = {
    ...view.calc
  }
  const nextDisplayFields = view.display.fields.filter(currentFieldId => currentFieldId !== fieldId)
  delete nextCalc[fieldId]

  const nextShared = {
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
    calc: nextCalc,
    display: {
      fields: nextDisplayFields
    }
  } as const
  const nextView: View = view.type === 'table'
    ? {
        ...nextShared,
        type: 'table',
        ...(nextGroup ? { group: nextGroup } : {}),
        options: pruneFieldFromViewOptions(view, fieldId)
      }
    : view.type === 'gallery'
      ? {
          ...nextShared,
          type: 'gallery',
          ...(nextGroup ? { group: nextGroup } : {}),
          options: view.options
        }
      : {
          ...nextShared,
          type: 'kanban',
          group: nextGroup ?? view.group,
          options: view.options
        }

  if (nextSearchFields === undefined && Object.prototype.hasOwnProperty.call(nextView.search, 'fields')) {
    delete (nextView.search as { fields?: readonly string[] }).fields
  }
  if ((view.type === 'table' || view.type === 'gallery') && !nextGroup && Object.prototype.hasOwnProperty.call(nextView, 'group')) {
    delete (nextView as { group?: ViewGroup }).group
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

  let nextGroup = 'group' in view
    ? view.group
    : undefined
  if (nextGroup?.fieldId === field.id) {
    const defaultMeta = fieldApi.group.meta(field)
    if (!defaultMeta.modes.length || !defaultMeta.sorts.length) {
      nextGroup = undefined
    } else {
      const modeMeta = fieldApi.group.meta(field, { mode: nextGroup.mode })
      nextGroup = {
        fieldId: field.id,
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

  const nextView: View = view.type === 'table'
    ? {
        ...view,
        type: 'table',
        filter: {
          ...view.filter,
          rules: nextFilterRules
        },
        ...(nextGroup ? { group: nextGroup } : {}),
        calc: nextCalc
      }
    : view.type === 'gallery'
      ? {
          ...view,
          type: 'gallery',
          filter: {
            ...view.filter,
            rules: nextFilterRules
          },
          ...(nextGroup ? { group: nextGroup } : {}),
          calc: nextCalc
        }
      : {
          ...view,
          type: 'kanban',
          filter: {
            ...view.filter,
            rules: nextFilterRules
          },
          group: nextGroup ?? view.group,
          calc: nextCalc
  }

  if ((view.type === 'table' || view.type === 'gallery') && !nextGroup && Object.prototype.hasOwnProperty.call(nextView, 'group')) {
    delete (nextView as { group?: ViewGroup }).group
  }

  return equal.sameJsonValue(nextView, view)
    ? view
    : nextView
}
