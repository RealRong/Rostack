import type {
  DataDoc,
  FieldId,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentViewById
} from '@dataview/core/document'
import {
  createGroupDemand
} from '#engine/active/index/group/demand.ts'
import {
  viewSortDemandFields,
} from '@dataview/core/view'
import type {
  IndexDemand
} from '#engine/active/index/contracts.ts'

export const resolveViewDemand = (
  document: DataDoc,
  activeViewId?: ViewId
): IndexDemand => {
  const view = activeViewId
    ? getDocumentViewById(document, activeViewId)
    : undefined
  if (!view) {
    return {}
  }

  const filterGroupFields = new Set<FieldId>()
  const filterSortFields = new Set<FieldId>()
  view.filter.rules.forEach(rule => {
    const field = getDocumentFieldById(document, rule.fieldId)
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

  const search = view.search.fields?.length
    ? { fields: view.search.fields }
    : { all: true }
  const groups = view.group
    ? [
        createGroupDemand(view.group),
        ...Array.from(filterGroupFields).map(fieldId => ({ fieldId }))
      ]
    : Array.from(filterGroupFields).map(fieldId => ({ fieldId }))
  const sortFields = Array.from(new Set([
    ...viewSortDemandFields(view),
    ...filterSortFields
  ]))

  return {
    search,
    ...(groups.length ? { groups } : {}),
    ...(sortFields.length
      ? { sortFields }
      : {}),
    ...(Object.entries(view.calc).some(([, metric]) => Boolean(metric))
      ? {
          calculationFields: Object.entries(view.calc)
            .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])
        }
      : {})
  }
}
