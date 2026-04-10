import type {
  DataDoc,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentViewById
} from '@dataview/core/document'
import {
  createGroupDemand
} from '../../index/group'
import {
  viewCalcFields,
  viewDisplayFields,
  viewFilterFields,
  viewSearchFields,
  viewSortDemandFields,
  viewSortFields
} from '@dataview/core/view'
import type {
  IndexDemand
} from '../../index/types'

export const resolveIndexDemand = (
  document: DataDoc,
  activeViewId?: ViewId
): IndexDemand => {
  const view = activeViewId
    ? getDocumentViewById(document, activeViewId)
    : undefined
  if (!view) {
    return {}
  }

  const search = view.search.fields?.length
    ? { fields: view.search.fields }
    : { all: true }

  return {
    ...(search ? { search } : {}),
    ...(view.group ? { groups: [createGroupDemand(view.group)] } : {}),
    ...(view.display.fields.length || view.sort.length
      ? { sortFields: viewSortDemandFields(view) }
      : {}),
    ...(Object.entries(view.calc).some(([, metric]) => Boolean(metric))
      ? {
          calculationFields: Object.entries(view.calc)
            .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])
        }
      : {})
  }
}
