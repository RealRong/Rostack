import type {
  FieldId,
  ViewId
} from '@dataview/core/contracts'
import {
  trimToUndefined
} from '@shared/core'
import {
  createGroupDemand
} from '@dataview/engine/active/index/group/demand'
import {
  createCalculationDemand
} from '@dataview/engine/active/shared/calculation'
import {
  viewSortFields,
} from '@dataview/core/view'
import type {
  IndexDemand
} from '@dataview/engine/active/index/contracts'
import type {
  DocumentReadContext
} from '@dataview/engine/document/reader'

export const resolveViewDemand = (
  context: DocumentReadContext,
  activeViewId?: ViewId
): IndexDemand => {
  const view = activeViewId === context.activeViewId
    ? context.activeView
    : activeViewId
      ? context.reader.views.get(activeViewId)
      : undefined
  if (!view) {
    return {}
  }

  const filterGroupFields = new Set<FieldId>()
  const filterSortFields = new Set<FieldId>()
  view.filter.rules.forEach(rule => {
    const field = context.reader.fields.get(rule.fieldId)
    switch (field?.kind) {
      case 'status':
      case 'select':
      case 'multiSelect':
      case 'boolean':
        filterGroupFields.add(rule.fieldId)
        break
      case 'number':
      case 'date':
        filterSortFields.add(rule.fieldId)
        break
      default:
        break
    }
  })

  const hasSearchQuery = Boolean(trimToUndefined(view.search.query))
  const search = !hasSearchQuery
    ? undefined
    : view.search.fields?.length
      ? { fields: view.search.fields }
      : { all: true }
  const groups = view.group
    ? [
        createGroupDemand(view.group, 'section'),
        ...Array.from(filterGroupFields).map(fieldId => ({
          fieldId,
          capability: 'filter' as const
        }))
      ]
    : Array.from(filterGroupFields).map(fieldId => ({
        fieldId,
        capability: 'filter' as const
      }))
  const sortFields = Array.from(new Set([
    ...viewSortFields(view),
    ...filterSortFields
  ]))

  return {
    ...(search ? { search } : {}),
    ...(groups.length ? { groups } : {}),
    ...(sortFields.length
      ? { sortFields }
      : {}),
    ...(Object.entries(view.calc).some(([, metric]) => Boolean(metric))
      ? {
          calculations: Object.entries(view.calc)
            .flatMap(([fieldId, metric]) => metric
              ? [createCalculationDemand(fieldId as FieldId, metric)]
              : [])
        }
      : {})
  }
}
