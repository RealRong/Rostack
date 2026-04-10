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
import type {
  IndexDemand
} from '../../index/types'

export const viewSearchFields = (
  view: View
): ReadonlySet<FieldId> | 'all' => (
  view.search.fields?.length
    ? new Set(view.search.fields)
    : 'all'
)

export const viewFilterFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.filter.rules.map(rule => rule.fieldId))

export const viewSortFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.sort.map(sorter => sorter.field))

export const viewCalcFields = (
  view: View
): ReadonlySet<FieldId> => new Set(
  Object.entries(view.calc)
    .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])
)

export const viewDisplayFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.display.fields)

export const viewSortDemandFields = (
  view: View
): readonly FieldId[] => Array.from(new Set([
  ...view.display.fields,
  ...view.sort.map(sorter => sorter.field)
]))

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
