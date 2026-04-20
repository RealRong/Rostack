import type {
  FieldId,
  ViewId
} from '@dataview/core/contracts'
import {
  createGroupDemand
} from '@dataview/engine/active/index/group/demand'
import {
  compileViewQuery
} from '@dataview/engine/active/query'
import {
  createCalculationDemand
} from '@dataview/engine/active/shared/calculation'
import {
  viewDisplayFields,
  viewSortFields
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

  const plan = compileViewQuery(context.reader, view)

  const search = {
    fieldIds: plan.demand.searchFieldIds
  }
  const groups = view.group
    ? [
        createGroupDemand(view.group, 'section'),
        ...plan.demand.groupFieldIds.map(fieldId => ({
          fieldId,
          capability: 'filter' as const
        }))
      ]
    : plan.demand.groupFieldIds.map(fieldId => ({
        fieldId,
        capability: 'filter' as const
      }))
  const sortFields = Array.from(new Set([
    ...viewSortFields(view),
    ...plan.demand.sortFieldIds
  ]))

  return {
    search,
    ...(groups.length ? { groups } : {}),
    ...(view.display.fields.length
      ? {
          displayFields: [...viewDisplayFields(view)]
        }
      : {}),
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
